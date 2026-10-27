import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { runAgent, type AgentTraceEvent } from '@/shared/agents';
import type { RunsRepository, RunRecord } from '../data/runs-repository';
import type { MetaClient } from '@/shared/meta';
import { RouterOutputSchema, type Intent, type RouterOutput } from '../schemas/router';
import type { BudgetGuard } from '@/shared/security';
import { checkForIdentifiers, type IdentifierFinding } from '../validators/identifiers';
import type { EuropePmcClient, PubmedClient } from '@/modules/02-retrieval';
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

export async function createRun(request: CreateRunRequest, deps: CreateRunDeps): Promise<CreateRunOutcome> {
  const parsed = CreateRunRequestSchema.parse(request);

  // Identifier pre-filter runs before anything else — CLAUDE.md rule 3, module 01:
  // a request naming a patient never reaches the model at all.
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
    promptVersion: 'P1@0.1',
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

  if (!routerResult.ok) {
    const run = await deps.runsRepository.createRun({
      id: runId,
      userId: parsed.userId,
      isPrecomputed,
      intent: 'unknown',
      status: 'failed',
    });
    return { status: 'routing_failed', run, reason: routerResult.reason };
  }

  const status = routerResult.value.intent === 'out_of_scope' ? 'abstained' : 'routing';
  const run = await deps.runsRepository.createRun({
    id: runId,
    userId: parsed.userId,
    isPrecomputed,
    intent: routerResult.value.intent,
    status,
  });

  return { status: 'routed', run, routerOutput: routerResult.value };
}

// Module 01 pipeline table: intents whose stages include plan/retrieve/curate
// (docs/architecture/01-orchestrator-and-routing.md). `mechanism` and `watch` run
// different pipelines (modules 08/09, not built yet); `out_of_scope` never gets here.
const INTENTS_NEEDING_RETRIEVAL = new Set<Intent>(['algorithm', 'evidence_map', 'comparison', 'fact_lookup']);

export interface CreateRunAndRetrieveDeps extends CreateRunDeps {
  p2PromptTemplate: string;
  p3PromptTemplate: string;
  p4PromptTemplate: string;
  pubmed: PubmedClient;
  europePmc: EuropePmcClient;
}

export type CreateRunAndRetrieveOutcome =
  | Exclude<CreateRunOutcome, { status: 'routed' }>
  | { status: 'routed'; run: RunRecord; routerOutput: RouterOutput; retrieval?: RunRetrievalResult };

/**
 * Composes `createRun` (routing, cheap and fast) with `runRetrievalPipeline`
 * (structure -> plan -> retrieve -> classify, module 02) for intents that need it.
 * Kept as a separate function, not folded into `createRun` itself, so `createRun`'s
 * existing unit tests and its own narrower contract (routing only) stay unchanged.
 *
 * Day-1 simplification, logged in SECURITY.md/DECISIONS.md: this runs the whole
 * retrieval chain synchronously inside the same request as `createRun` — a live
 * smoke test measured ~13-14s end to end, which risks Vercel's function time limit
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
  if (!INTENTS_NEEDING_RETRIEVAL.has(outcome.routerOutput.intent)) return outcome;

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
