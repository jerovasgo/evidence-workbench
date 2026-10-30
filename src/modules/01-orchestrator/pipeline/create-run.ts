import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { runAgent, type AgentTraceEvent } from '@/shared/agents';
import type { RunsRepository, RunRecord } from '../data/runs-repository';
import type { MetaClient } from '@/shared/meta';
import { RouterOutputSchema, type Intent, type RouterOutput } from '../schemas/router';
import type { BudgetGuard } from '@/shared/security';
import { checkForIdentifiers, type IdentifierFinding } from '../validators/identifiers';
import type { CrossrefClient, EuropePmcClient, PubmedClient } from '@/modules/02-retrieval';
import { runRetrievalPipeline, type RunRetrievalResult } from './run-retrieval';

// Module 01 request lifecycle, first slice:
// "POST /api/runs -> validate (zod) -> auth/rate-limit/budget guard -> create Run
// (queued) -> route (T0) -> ...". This function is the thin route handler's actual
// logic, kept pure (no Request/Response, no direct env/network access) so it is fully
// unit-testable; src/app/api/runs/route.ts only wires real dependencies into it.
//
// Day-1 simplification: `isPrecomputed` is set to `userId === null` (anonymous
// requests are treated as the precomputed-eligible path). The real precompute
// pipeline — pre-running the 15 evaluation conditions ahead of time (SPEC §9) — does
// not exist yet; this is a stand-in until it does.

export const CreateRunRequestSchema = z.object({
  freeText: z.string().min(1).max(1500),
  userId: z.string().uuid().nullable(),
});
export type CreateRunRequest = z.infer<typeof CreateRunRequestSchema>;

export interface CreateRunDeps {
  runsRepository: RunsRepository;
  metaClient: MetaClient;
  budgetGuard: BudgetGuard;
  dailyBudgetUsd: number;
  p0Preamble: string;
  /** Contains the literal substring `{{free_text}}` to be replaced with the request text. */
  p1PromptTemplate: string;
  onTrace?: (event: AgentTraceEvent) => void;
}

export type CreateRunOutcome =
  | { status: 'rejected_identifiers'; findings: IdentifierFinding[] }
  | { status: 'budget_exhausted' }
  | { status: 'routed'; run: RunRecord; routerOutput: RouterOutput }
  | { status: 'routing_failed'; run: RunRecord; reason: string };

/** Keep research usable when the optional model router times out or returns invalid JSON. */
export function fallbackRouterOutput(query: string): RouterOutput {
  const text = query.toLowerCase();
  const intent: Intent = /\b(compare|comparison|contrast|versus|vs\.?|comparar|comparación|contrastar)\b/u.test(text)
    ? 'comparison'
    : /\b(algorithm|algoritmo|decision tree|flowchart)\b/u.test(text)
      ? 'algorithm'
      : /\b(map|network|relationship|relationships|links?|mapa|red|relación|relaciones|vínculo)\b/u.test(text)
        ? 'evidence_map'
        : 'fact_lookup';
  return {
    intent,
    confidence: 'low',
    opening: 'I am checking the relevant literature and experimental context before drawing a conclusion. Findings will appear with their source quotations as they are verified.',
  };
}

export async function createRun(request: CreateRunRequest, deps: CreateRunDeps): Promise<CreateRunOutcome> {
  const parsed = CreateRunRequestSchema.parse(request);

  // Identifier pre-filter runs before anything else — CLAUDE.md rule 3, module 01:
  // a request naming a specific, identifiable real person never reaches the model at all.
  const identifierCheck = checkForIdentifiers(parsed.freeText);
  if (identifierCheck.rejected) {
    return { status: 'rejected_identifiers', findings: identifierCheck.findings };
  }

  // Global daily budget kill switch (module 10): once today's spend reaches the cap,
  // stop creating new live runs rather than let cost overrun the shared credit budget.
  if (deps.budgetGuard.spentToday() >= deps.dailyBudgetUsd) {
    return { status: 'budget_exhausted' };
  }

  const runId = randomUUID();

  const routerResult = await runAgent({
    name: 'router',
    promptVersion: 'P1@0.3',
    tier: 'T0',
    systemPreamble: deps.p0Preamble,
    prompt: deps.p1PromptTemplate.replace('{{free_text}}', parsed.freeText),
    outputSchema: RouterOutputSchema,
    // Module 01 sketches 4s/300 tokens for the router; a live smoke test showed real
    // latency exceeds 4s even at 'minimal' reasoning, and reasoning tokens alone (298)
    // exhausted a 300-token budget before any JSON could be emitted (response status
    // "incomplete", reason "max_output_tokens") — reasoning tokens count against this
    // limit at the API level, which the architecture doc didn't account for.
    limits: { maxOutputTokens: 800, timeoutMs: 10000, maxCostUsd: 0.02 },
    ctx: { runId, metaClient: deps.metaClient, budgetGuard: deps.budgetGuard, onTrace: deps.onTrace },
  });

  const isPrecomputed = parsed.userId === null;

  if (!routerResult.ok) console.warn(JSON.stringify({ type: 'router_fallback', runId, reason: routerResult.reason }));
  const routerOutput = routerResult.ok ? routerResult.value : fallbackRouterOutput(parsed.freeText);

  const status = routerOutput.intent === 'out_of_scope' ? 'abstained' : 'routing';
  const run = await deps.runsRepository.createRun({
    id: runId,
    userId: parsed.userId,
    isPrecomputed,
    intent: routerOutput.intent,
    status,
  });

  return { status: 'routed', run, routerOutput };
}

// Module 01 pipeline table: intents whose stages include plan/retrieve/curate
// (docs/architecture/01-orchestrator-and-routing.md). Mechanism questions still
// need the evidence retrieval path while their specialized view is unfinished.
// `watch` and `out_of_scope` remain separate intents.
const INTENTS_NEEDING_RETRIEVAL = new Set<Intent>(['algorithm', 'evidence_map', 'mechanism', 'comparison', 'fact_lookup']);

/** Exported so both this module's batch composition and the SSE route agree on which intents need it. */
export function intentNeedsRetrieval(intent: Intent): boolean {
  return INTENTS_NEEDING_RETRIEVAL.has(intent);
}

export interface CreateRunAndRetrieveDeps extends CreateRunDeps {
  p2PromptTemplate: string;
  p3PromptTemplate: string;
  p4PromptTemplate: string;
  p5PromptTemplate: string;
  p10PromptTemplate: string;
  pubmed: PubmedClient;
  europePmc: EuropePmcClient;
  crossref: CrossrefClient;
}

export type CreateRunAndRetrieveOutcome =
  | Exclude<CreateRunOutcome, { status: 'routed' }>
  | { status: 'routed'; run: RunRecord; routerOutput: RouterOutput; retrieval?: RunRetrievalResult };

/**
 * Composes `createRun` (routing, cheap and fast) with the full synchronous,
 * batch form of `runRetrievalPipeline` (structure -> plan -> retrieve -> classify ->
 * extract, modules 02/03) for intents that need it. `POST /api/runs` no longer calls
 * this for interactive requests — it stashes a `PendingRunContext` instead and lets
 * `GET /api/runs/:id/stream` (SSE) run the pipeline with progressive events for a
 * low time-to-first-token (see that route's own comment). This function remains for
 * callers that genuinely want one awaited result with no incremental feedback — a
 * future precompute/batch job for the evaluation conditions (SPEC §9), or a test.
 *
 * Kept as a separate function, not folded into `createRun` itself, so `createRun`'s
 * existing unit tests and its own narrower contract (routing only) stay unchanged.
 *
 * Day-1 simplification, logged in SECURITY.md/DECISIONS.md: this runs the whole
 * retrieval chain synchronously inside one call — a live smoke test measured
 * ~13-14s end to end before the extract stage existed (now longer, extraction alone
 * measured ~9-10s per source). Not a Vercel timeout risk (Hobby's limit is 300s
 * default *and* max, docs/DAY0-VERIFICATION.md §4) but still no incremental feedback
 * (module 01's own "Build notes": long stages must be resumable chunks or run in a
 * worker; that doesn't exist yet). No `stage_outputs` persistence happens here either
 * (no repository for that table exists yet) — a crashed request today loses the
 * retrieval result entirely rather than resuming from it.
 */
export async function createRunAndRetrieve(
  request: CreateRunRequest,
  deps: CreateRunAndRetrieveDeps,
): Promise<CreateRunAndRetrieveOutcome> {
  const outcome = await createRun(request, deps);
  if (outcome.status !== 'routed') return outcome;
  if (outcome.run.status === 'abstained') return outcome; // out_of_scope: nothing to retrieve
  if (!intentNeedsRetrieval(outcome.routerOutput.intent)) return outcome;

  const retrieval = await runRetrievalPipeline(
    {
      runId: outcome.run.id,
      freeText: request.freeText,
      routerCondition: outcome.routerOutput.condition,
      routerSetting: outcome.routerOutput.setting,
    },
    deps,
  );

  return { ...outcome, retrieval };
}

export interface GetRunDeps {
  runsRepository: RunsRepository;
}

export type GetRunOutcome =
  | { status: 'found'; run: RunRecord }
  | { status: 'not_found' }
  | { status: 'forbidden' };

/**
 * Mirrors the `runs` RLS policy in application code (defense in depth): a server
 * route using the service-role client bypasses RLS entirely, so this check is what
 * actually enforces "visible to its owner or if precomputed" for that path.
 */
export async function getRunForViewer(id: string, viewerUserId: string | null, deps: GetRunDeps): Promise<GetRunOutcome> {
  const run = await deps.runsRepository.getRun(id);
  if (!run) return { status: 'not_found' };
  if (run.isPrecomputed || run.userId === viewerUserId) {
    return { status: 'found', run };
  }
  return { status: 'forbidden' };
}
