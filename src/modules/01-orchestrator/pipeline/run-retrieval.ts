import { z } from 'zod';
import type { AgentTraceEvent } from '@/shared/agents';
import { ClaimSchema, type Claim } from '@/shared/domain';
import type { MetaClient } from '@/shared/meta';
import type { BudgetGuard } from '@/shared/security';
import { StageResultSchema } from '@/shared/domain';
import { buildSourceScore, type ScoreBreakdown } from '@/modules/04-grading-scoring';
import {
  CandidateSourceSchema,
  DEFAULT_ALLOWED_DOMAIN_NAMES,
  SearchPlanSchema,
  SourceClassificationSchema,
  buildSeedSearchPlan,
  classifyCandidateMetadata,
  deduplicateCandidates,
  executeSearchPlan,
  planSearch,
  type CandidateSource,
  type CrossrefClient,
  type EuropePmcClient,
  type PubmedClient,
  type SourceClassification,
} from '@/modules/02-retrieval';
import { structureScenario } from '../agents/scenario-structurer';
import { ScenarioStructureSchema, type ScenarioStructure } from '../schemas/scenario-structure';
import type { StageOutputRecord, StageOutputsRepository } from '../data/stage-outputs-repository';
import { extractAndVerifyPool, type PoolSourceOutcome } from './extract-and-verify-pool';

// Module 01 request lifecycle: "structure (T0) -> [plan -> retrieve -> curate] ->
// extract -> verify". Covers structure (P2) -> plan (P3) -> retrieve (module 02
// connectors) -> dedupe (module 02 curation) -> classify (P4) -> extract+verify
// (P5 + deterministic checks, module 03, via `extract-and-verify-pool.ts`).
// Deliberately NOT included here, logged as a known gap in SECURITY.md:
// version-resolution/diversity-selection/coverage-report (module 02 curation) — they
// need candidates grouped by issuer+topic, which nothing in the codebase computes yet
// and isn't a well-defined piece to invent without further design; scoring (module
// 02's `score.ts`) likewise isn't wired in here, for the same reason. `classify`'s
// `metadataAndText` is metadata-only (title/issuer/year/family) — no abstract/full
// text, since fetching full text per candidate before dedup/classify would be its
// own (expensive) stage; this makes `source-classifier`'s confidence lower than it
// would be with real abstract text, an honest Day-1 limitation, not a silent one.
//
// Each stage returns the shared `StageResultSchema` envelope (shared/domain/run.ts)
// so a stage can fail or go partial without aborting the ones after it that still
// have usable input (module 01: "a stage timeout yields partial, not a failed run,
// when usable output exists"). `deps.onStageEvent` is the time-to-first-token hook:
// it fires as each stage completes AND, during `extract`, as each source's claims
// come back — the caller (the SSE route) uses this to stream progress instead of
// waiting for the whole function to resolve once.

export interface StageResult<T> {
  stage: string;
  status: 'ok' | 'partial' | 'abstain' | 'failed';
  value?: T;
  reasons?: string[];
  metrics: { ms: number; costUsd: number; counts?: Record<string, number> };
}

/**
 * Builds a `StageResult<T>` after validating its shape against the shared
 * `StageResultSchema(schema)` zod contract. The cast resolves a TS generic-inference
 * mismatch between this file's plain `StageResult<T>` and the zod factory's inferred
 * return type for a given `T`'s schema — both describe the exact same shape, and the
 * `.parse` call is the real guarantee, not the cast.
 */
function toStageResult<T>(schema: z.ZodType<T>, raw: unknown): StageResult<T> {
  return StageResultSchema(schema).parse(raw) as StageResult<T>;
}

/**
 * Module 01 resumability: if a usable ('ok' or 'partial') prior output for this
 * stage was already persisted, reuse it instead of recomputing — the whole point
 * of `stage_outputs` existing. Returns null (meaning "run the stage") when there is
 * nothing to resume from, the prior attempt failed/abstained, or the stored payload
 * no longer matches the current schema (defensive: never resume into a shape the
 * rest of the pipeline can't trust).
 */
function resumeStage<T>(stage: StageName, schema: z.ZodType<T>, latest: Map<string, StageOutputRecord> | undefined): StageResult<T> | null {
  const record = latest?.get(stage);
  if (!record || (record.status !== 'ok' && record.status !== 'partial')) return null;
  const parsed = schema.safeParse(record.value);
  if (!parsed.success) return null;
  return toStageResult(schema, { stage, status: record.status, value: parsed.data, reasons: record.reasons, metrics: record.metrics });
}

/** Best-effort: a persistence failure must never fail the run itself. */
async function persistStage<T>(stageOutputs: StageOutputsRepository | undefined, runId: string, result: StageResult<T>): Promise<void> {
  if (!stageOutputs) return;
  try {
    await stageOutputs.insert({ runId, stage: result.stage, status: result.status, value: result.value, reasons: result.reasons, metrics: result.metrics });
  } catch {
    // swallow — the in-memory result is already correct for this run.
  }
}

type StageName = 'structure' | 'plan' | 'retrieve' | 'classify' | 'extract';

export type RunRetrievalStageEvent =
  | { type: 'stage_started'; stage: StageName }
  | { type: 'stage_result'; stage: StageName; status: StageResult<unknown>['status']; metrics: StageResult<unknown>['metrics']; resumed: boolean }
  | { type: 'sources_retrieved'; sources: CandidateSource[] }
  | { type: 'source_extracted'; sourceId: string; outcome: PoolSourceOutcome }
  | { type: 'provisional_claims'; sourceId: string; claims: Claim[] };

export interface RunRetrievalInput {
  runId: string;
  freeText: string;
  /** The router's (P1) best-guess fields, passed through as hints to structure/plan. */
  routerCondition?: string;
  routerSetting?: string;
}

export interface RunRetrievalDeps {
  metaClient: MetaClient;
  budgetGuard: BudgetGuard;
  crossref: CrossrefClient;
  p0Preamble: string;
  p2PromptTemplate: string;
  p3PromptTemplate: string;
  p4PromptTemplate: string;
  p5PromptTemplate: string;
  p10PromptTemplate: string;
  pubmed: PubmedClient;
  europePmc: EuropePmcClient;
  /** Apex domains fetch_url_text may read from for 'web'/'guideline' queries; defaults to the curated list. */
  allowedFetchDomains?: readonly string[];
  maxConcurrency?: number;
  perQueryTimeoutMs?: number;
  maxExtractSources?: number;
  extractionTimeBudgetMs?: number;
  maxExtractConcurrency?: number;
  /** Enables resumability: reuse a usable prior stage output instead of recomputing, and persist each newly computed one. Omit to run every stage fresh (e.g. tests). */
  stageOutputs?: StageOutputsRepository;
  onTrace?: (event: AgentTraceEvent) => void;
  onStageEvent?: (event: RunRetrievalStageEvent) => void;
}

export interface RunRetrievalResult {
  structure: StageResult<ScenarioStructure>;
  plan: StageResult<z.infer<typeof SearchPlanSchema>>;
  retrieval: StageResult<CandidateSource[]>;
  classification: StageResult<SourceClassification[]>;
  extraction: StageResult<Claim[]>;
  /** Module 04 Part B, keyed by `SourceClassification.sourceId`. Pure code, computed once classification is available — not its own stage (no model call, nothing to fail/resume). */
  sourceScores: Record<string, ScoreBreakdown>;
}

export async function runRetrievalPipeline(input: RunRetrievalInput, deps: RunRetrievalDeps): Promise<RunRetrievalResult> {
  const latest = deps.stageOutputs ? await deps.stageOutputs.getLatestPerStage(input.runId).catch(() => undefined) : undefined;

  // The initial literature search is deterministic and begins before the model
  // finishes structuring sub-questions. Resumed runs reuse the persisted plan.
  let plan = resumeStage('plan', SearchPlanSchema, latest);
  const planResumed = plan !== null;
  if (!plan) {
    deps.onStageEvent?.({ type: 'stage_started', stage: 'plan' });
    const started = Date.now();
    plan = toStageResult(SearchPlanSchema, {
      stage: 'plan', status: 'ok',
      value: buildSeedSearchPlan(input.freeText || input.routerCondition || 'scientific evidence'),
      metrics: { ms: Date.now() - started, costUsd: 0 },
    });
    await persistStage(deps.stageOutputs, input.runId, plan);
  }
  deps.onStageEvent?.({ type: 'stage_result', stage: 'plan', status: plan.status, metrics: plan.metrics, resumed: planResumed });

  const candidateArraySchema = z.array(CandidateSourceSchema);
  let retrieval = resumeStage('retrieve', candidateArraySchema, latest);
  const retrievalResumed = retrieval !== null;
  const retrieveStarted = Date.now();
  if (!retrieval) deps.onStageEvent?.({ type: 'stage_started', stage: 'retrieve' });
  const searchPromise = !retrieval && plan.value ? executeSearchPlan(plan.value, {
    pubmed: deps.pubmed,
    europePmc: deps.europePmc,
    maxConcurrency: deps.maxConcurrency,
    perQueryTimeoutMs: deps.perQueryTimeoutMs,
  }) : null;

  // --- structure (P2) ---
  let structure = resumeStage('structure', ScenarioStructureSchema, latest);
  const structureResumed = structure !== null;
  if (!structure) {
    deps.onStageEvent?.({ type: 'stage_started', stage: 'structure' });
    const structureStarted = Date.now();
    const structureAgentResult = await structureScenario(
      input.runId,
      { freeText: input.freeText, condition: input.routerCondition, setting: input.routerSetting },
      {
        metaClient: deps.metaClient,
        budgetGuard: deps.budgetGuard,
        p0Preamble: deps.p0Preamble,
        p2PromptTemplate: deps.p2PromptTemplate,
        onTrace: deps.onTrace,
      },
    );
    const structureMs = Date.now() - structureStarted;

    structure = structureAgentResult.ok
      ? toStageResult(ScenarioStructureSchema, {
          stage: 'structure',
          status: 'ok',
          value: structureAgentResult.value,
          metrics: { ms: structureMs, costUsd: structureAgentResult.usage.costUsd },
        })
      : toStageResult(ScenarioStructureSchema, {
          stage: 'structure',
          status: 'failed',
          reasons: [structureAgentResult.detail],
          metrics: { ms: structureMs, costUsd: 0 },
        });
    await persistStage(deps.stageOutputs, input.runId, structure);
  }
  deps.onStageEvent?.({ type: 'stage_result', stage: 'structure', status: structure.status, metrics: structure.metrics, resumed: structureResumed });

  // --- retrieve + dedupe --- search started before P2; its results are joined here.
  if (!retrieval) {
    if (!searchPromise) {
      retrieval = toStageResult(candidateArraySchema, {
        stage: 'retrieve',
        status: 'failed',
        reasons: ['No search plan to execute (plan stage failed)'],
        metrics: { ms: 0, costUsd: 0 },
      });
    } else {
      let executed = await searchPromise;
      let expanded = false;
      if (executed.candidates.length === 0) {
        // Only an empty first pass pays for an agent-planned expansion. Its query
        // output is still executed through the same bounded, allow-listed tools.
        const expansion = await planSearch(
          input.runId,
          { condition: input.freeText || input.routerCondition || 'scientific evidence', subQuestions: structure.value?.subQuestions, setting: structure.value?.context },
          { metaClient: deps.metaClient, budgetGuard: deps.budgetGuard, p0Preamble: deps.p0Preamble, p3PromptTemplate: deps.p3PromptTemplate, onTrace: deps.onTrace },
        );
        if (expansion.ok) {
          expanded = true;
          const next = await executeSearchPlan(expansion.value, {
            pubmed: deps.pubmed,
            europePmc: deps.europePmc,
            maxConcurrency: deps.maxConcurrency,
            perQueryTimeoutMs: deps.perQueryTimeoutMs,
            webSearch: { runId: input.runId, metaClient: deps.metaClient, budgetGuard: deps.budgetGuard, allowedDomains: deps.allowedFetchDomains ?? DEFAULT_ALLOWED_DOMAIN_NAMES },
          });
          executed = { candidates: next.candidates, skipped: [...executed.skipped, ...next.skipped], failed: [...executed.failed, ...next.failed] };
        }
      }
      const retrieveMs = Date.now() - retrieveStarted;
      const deduped = deduplicateCandidates(executed.candidates);
      const hasIssues = executed.skipped.length > 0 || executed.failed.length > 0;

      retrieval = toStageResult(candidateArraySchema, {
        stage: 'retrieve',
        status: deduped.length === 0 && hasIssues ? 'failed' : hasIssues ? 'partial' : 'ok',
        value: deduped,
        reasons: hasIssues
          ? [
              ...executed.skipped.map((s) => `Skipped "${s.query.text}" (${s.query.family}): ${s.reason}`),
              ...executed.failed.map((f) => `Failed "${f.query.text}" (${f.query.family}): ${f.error}`),
            ]
          : undefined,
        metrics: {
          ms: retrieveMs,
          costUsd: 0,
          counts: { raw: executed.candidates.length, deduped: deduped.length, skipped: executed.skipped.length, failed: executed.failed.length, expanded: Number(expanded) },
        },
      });
    }
    await persistStage(deps.stageOutputs, input.runId, retrieval);
  }
  deps.onStageEvent?.({ type: 'stage_result', stage: 'retrieve', status: retrieval.status, metrics: retrieval.metrics, resumed: retrievalResumed });
  if (retrieval.value?.length) deps.onStageEvent?.({ type: 'sources_retrieved', sources: retrieval.value });

  // --- classify from explicit metadata only --- unknown design stays `other`.
  const classificationArraySchema = z.array(SourceClassificationSchema);
  let classification = resumeStage('classify', classificationArraySchema, latest);
  const classificationResumed = classification !== null;
  if (!classification) {
    deps.onStageEvent?.({ type: 'stage_started', stage: 'classify' });
    if (!retrieval.value || retrieval.value.length === 0) {
      classification = toStageResult(classificationArraySchema, {
        stage: 'classify',
        status: 'abstain',
        reasons: ['No candidates to classify'],
        metrics: { ms: 0, costUsd: 0 },
      });
    } else {
      const classifyStarted = Date.now();
      classification = toStageResult(classificationArraySchema, {
        stage: 'classify', status: 'ok',
        value: retrieval.value.map(classifyCandidateMetadata),
        metrics: { ms: Date.now() - classifyStarted, costUsd: 0, counts: { classified: retrieval.value.length } },
      });
    }
    await persistStage(deps.stageOutputs, input.runId, classification);
  }
  deps.onStageEvent?.({ type: 'stage_result', stage: 'classify', status: classification.status, metrics: classification.metrics, resumed: classificationResumed });

  // --- source scores (module 04 Part B) --- pure code, no model call; computed for
  // every classified source regardless of whether extraction ever reaches it, so the
  // UI can show "why ranked here" for any source a claim cites.
  const sourceScores: Record<string, ScoreBreakdown> = {};
  for (const c of classification.value ?? []) {
    sourceScores[c.sourceId] = buildSourceScore(c, structure.value?.context ?? 'unknown');
  }

  // --- extract + verify (P5 + deterministic checks, module 03) --- only runs if
  // there are candidates; classification is used for prioritization only (missing/
  // failed classification just means no kind-based prioritization, not a blocker).
  const extractArraySchema = z.array(ClaimSchema);
  let extraction = resumeStage('extract', extractArraySchema, latest);
  const extractionResumed = extraction !== null;
  if (!extraction) {
    deps.onStageEvent?.({ type: 'stage_started', stage: 'extract' });
    if (!retrieval.value || retrieval.value.length === 0) {
      extraction = toStageResult(extractArraySchema, {
        stage: 'extract',
        status: 'abstain',
        reasons: ['No candidates to extract from'],
        metrics: { ms: 0, costUsd: 0 },
      });
    } else {
      const extractStarted = Date.now();
      const pool = await extractAndVerifyPool(
        {
          runId: input.runId,
          candidates: retrieval.value,
          classifications: classification.value ?? [],
          subQuestions: structure.value?.subQuestions ?? [],
          maxSources: deps.maxExtractSources,
          timeBudgetMs: deps.extractionTimeBudgetMs,
          maxConcurrency: deps.maxExtractConcurrency,
        },
        {
          metaClient: deps.metaClient,
          budgetGuard: deps.budgetGuard,
          crossref: deps.crossref,
          europePmc: deps.europePmc,
          webFetch: { allowedDomains: deps.allowedFetchDomains ?? DEFAULT_ALLOWED_DOMAIN_NAMES },
          p0Preamble: deps.p0Preamble,
          p5PromptTemplate: deps.p5PromptTemplate,
          p10PromptTemplate: deps.p10PromptTemplate,
          onTrace: deps.onTrace,
          onSourceDone: (sourceId, outcome) => deps.onStageEvent?.({ type: 'source_extracted', sourceId, outcome }),
          onProvisionalClaims: (sourceId, claims) => deps.onStageEvent?.({ type: 'provisional_claims', sourceId, claims }),
        },
      );
      const extractMs = Date.now() - extractStarted;

      const noFullText = pool.perSource.filter((s) => s.outcome.status === 'no_full_text').length;
      const extractionFailed = pool.perSource.filter((s) => s.outcome.status === 'extraction_failed').length;
      const okOutcomes = pool.perSource.flatMap((s) => (s.outcome.status === 'ok' ? [s.outcome] : []));
      const qualifiedClaims = okOutcomes.flatMap((outcome) => outcome.qualified);
      if (deps.stageOutputs) {
        try {
          await deps.stageOutputs.insert({ runId: input.runId, stage: 'qualified_claims', status: 'ok', value: qualifiedClaims, metrics: { ms: 0, costUsd: 0, counts: { claims: qualifiedClaims.length } } });
        } catch {
          // Live claims remain available even if stage persistence fails.
        }
      }
      const droppedClaims = okOutcomes.flatMap((o) => o.dropped);
      const dropReasons = droppedClaims.reduce<Record<string, number>>((counts, drop) => {
        const category = /quote not found/i.test(drop.reason) ? 'quote'
          : /number\(s\)/i.test(drop.reason) ? 'number'
          : /retract|withdrawn/i.test(drop.reason) ? 'retraction'
          : /support|cited quote/i.test(drop.reason) ? 'support'
          : /passageId|locator/i.test(drop.reason) ? 'locator' : 'other';
        counts[`drop_${category}`] = (counts[`drop_${category}`] ?? 0) + 1;
        return counts;
      }, {});
      const retractedDropped = droppedClaims.filter((d) => d.reason === 'source is retracted or withdrawn').length;
      const hasIssues = noFullText > 0 || extractionFailed > 0 || pool.sourcesNotStarted > 0;

      extraction = toStageResult(extractArraySchema, {
        stage: 'extract',
        status: pool.claims.length === 0 ? (pool.perSource.length > 0 ? 'partial' : 'abstain') : hasIssues ? 'partial' : 'ok',
        value: pool.claims,
        reasons: hasIssues
          ? [...pool.perSource
              .filter((s) => s.outcome.status !== 'ok')
              .map((s) => `${s.sourceId}: ${s.outcome.status === 'extraction_failed' ? s.outcome.reason : 'no full text available'}`),
              ...(pool.sourcesNotStarted > 0 ? [`${pool.sourcesNotStarted} source(s) not started before the exploration window ended`] : [])]
          : undefined,
        metrics: {
          ms: extractMs,
          costUsd: pool.costUsd,
          counts: {
            sourcesAttempted: pool.perSource.length,
            sourcesNotStarted: pool.sourcesNotStarted,
            claimsKept: pool.claims.length,
            claimsDropped: droppedClaims.length,
            ...dropReasons,
            claimsPartial: qualifiedClaims.length,
            retracted: retractedDropped,
            noFullText,
            extractionFailed,
          },
        },
      });
    }
    await persistStage(deps.stageOutputs, input.runId, extraction);
  }
  deps.onStageEvent?.({ type: 'stage_result', stage: 'extract', status: extraction.status, metrics: extraction.metrics, resumed: extractionResumed });

  return { structure, plan, retrieval, classification, extraction, sourceScores };
}
