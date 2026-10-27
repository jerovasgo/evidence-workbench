import { z } from 'zod';
import type { AgentTraceEvent } from '@/shared/agents';
import type { MetaClient } from '@/shared/meta';
import type { BudgetGuard } from '@/shared/security';
import { StageResultSchema } from '@/shared/domain';
import {
  CandidateSourceSchema,
  SearchPlanSchema,
  SourceClassificationSchema,
  applyPubmedTypeOverride,
  classifySources,
  deduplicateCandidates,
  executeSearchPlan,
  planSearch,
  type CandidateSource,
  type EuropePmcClient,
  type PubmedClient,
  type SourceClassification,
} from '@/modules/02-retrieval';
import { structureScenario } from '../agents/scenario-structurer';
import { ScenarioStructureSchema, type ScenarioStructure } from '../schemas/scenario-structure';

// Module 01 request lifecycle: "structure (T0) -> [plan -> retrieve -> curate]".
// This is the first slice of that bracket: structure (P2) -> plan (P3, module 02) ->
// retrieve (module 02 connectors) -> dedupe (module 02 curation) -> classify (P4,
// module 02). Deliberately NOT included here, logged as a known gap in SECURITY.md:
// version-resolution/diversity-selection/coverage-report (module 02 curation) — they
// need candidates grouped by issuer+topic, which nothing in the codebase computes yet
// and isn't a well-defined piece to invent without further design; scoring (module
// 02's `score.ts`) likewise isn't wired in here, for the same reason: it folds in
// level/currency/applicability weights this stage doesn't yet have enough structured
// input to compute. `classification`'s `metadataAndText` is metadata-only (title/
// issuer/year/family) — no abstract/full text, since fetching full text per
// candidate before dedup/classify would be its own (expensive) stage; this makes
// `source-classifier`'s confidence lower than it would be with real abstract text,
// an honest Day-1 limitation, not a silent one.
//
// Each stage returns the shared `StageResultSchema` envelope (shared/domain/run.ts)
// so a stage can fail or go partial without aborting the ones after it that still
// have usable input (module 01: "a stage timeout yields partial, not a failed run,
// when usable output exists").

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

const MAX_SOURCES_PER_CLASSIFY_CALL = 40;

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
  p0Preamble: string;
  p2PromptTemplate: string;
  p3PromptTemplate: string;
  p4PromptTemplate: string;
  pubmed: PubmedClient;
  europePmc: EuropePmcClient;
  maxConcurrency?: number;
  perQueryTimeoutMs?: number;
  onTrace?: (event: AgentTraceEvent) => void;
}

export interface RunRetrievalResult {
  structure: StageResult<ScenarioStructure>;
  plan: StageResult<z.infer<typeof SearchPlanSchema>>;
  retrieval: StageResult<CandidateSource[]>;
  classification: StageResult<SourceClassification[]>;
}

function buildMetadataAndText(candidate: CandidateSource): string {
  const parts = [candidate.title];
  if (candidate.issuer) parts.push(`Issuer: ${candidate.issuer}`);
  if (candidate.year) parts.push(`Year: ${candidate.year}`);
  parts.push(`Family: ${candidate.family}`);
  return parts.join('. ');
}

export async function runRetrievalPipeline(input: RunRetrievalInput, deps: RunRetrievalDeps): Promise<RunRetrievalResult> {
  // --- structure (P2) ---
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

  const structure: StageResult<ScenarioStructure> = structureAgentResult.ok
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

  // --- plan (P3) --- degrades to the router's condition hint + free text when
  // structure failed, rather than aborting the whole pipeline (module 01: continue
  // with usable input).
  const planCondition = input.routerCondition ?? structure.value?.population ?? input.freeText;
  const planSetting = structure.value?.setting !== 'unknown' ? structure.value?.setting : input.routerSetting;

  const planStarted = Date.now();
  const planAgentResult = await planSearch(
    input.runId,
    { condition: planCondition, subQuestions: structure.value?.subQuestions, setting: planSetting },
    { metaClient: deps.metaClient, budgetGuard: deps.budgetGuard, p0Preamble: deps.p0Preamble, p3PromptTemplate: deps.p3PromptTemplate, onTrace: deps.onTrace },
  );
  const planMs = Date.now() - planStarted;

  const plan: StageResult<z.infer<typeof SearchPlanSchema>> = planAgentResult.ok
    ? toStageResult(SearchPlanSchema, {
        stage: 'plan',
        status: 'ok',
        value: planAgentResult.value,
        metrics: { ms: planMs, costUsd: planAgentResult.usage.costUsd },
      })
    : toStageResult(SearchPlanSchema, {
        stage: 'plan',
        status: 'failed',
        reasons: [planAgentResult.detail],
        metrics: { ms: planMs, costUsd: 0 },
      });

  // --- retrieve + dedupe (module 02) --- only runs if a plan exists.
  const candidateArraySchema = z.array(CandidateSourceSchema);
  let retrieval: StageResult<CandidateSource[]>;

  if (!plan.value) {
    retrieval = toStageResult(candidateArraySchema, {
      stage: 'retrieve',
      status: 'failed',
      reasons: ['No search plan to execute (plan stage failed)'],
      metrics: { ms: 0, costUsd: 0 },
    });
  } else {
    const retrieveStarted = Date.now();
    const executed = await executeSearchPlan(plan.value, {
      pubmed: deps.pubmed,
      europePmc: deps.europePmc,
      maxConcurrency: deps.maxConcurrency,
      perQueryTimeoutMs: deps.perQueryTimeoutMs,
    });
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
        counts: { raw: executed.candidates.length, deduped: deduped.length, skipped: executed.skipped.length, failed: executed.failed.length },
      },
    });
  }

  // --- classify (P4 + applyPubmedTypeOverride) --- only runs if there are candidates.
  const classificationArraySchema = z.array(SourceClassificationSchema);
  let classification: StageResult<SourceClassification[]>;

  if (!retrieval.value || retrieval.value.length === 0) {
    classification = toStageResult(classificationArraySchema, {
      stage: 'classify',
      status: 'abstain',
      reasons: ['No candidates to classify'],
      metrics: { ms: 0, costUsd: 0 },
    });
  } else {
    const toClassify = retrieval.value.slice(0, MAX_SOURCES_PER_CLASSIFY_CALL);
    const truncated = retrieval.value.length > MAX_SOURCES_PER_CLASSIFY_CALL;

    const classifyStarted = Date.now();
    const classifyAgentResult = await classifySources(
      input.runId,
      { sources: toClassify.map((c) => ({ sourceId: c.tempId, title: c.title, metadataAndText: buildMetadataAndText(c) })) },
      { metaClient: deps.metaClient, budgetGuard: deps.budgetGuard, p0Preamble: deps.p0Preamble, p4PromptTemplate: deps.p4PromptTemplate, onTrace: deps.onTrace },
    );
    const classifyMs = Date.now() - classifyStarted;

    if (classifyAgentResult.ok) {
      const byTempId = new Map(toClassify.map((c) => [c.tempId, c]));
      const overridden = classifyAgentResult.value.classifications.map((classification) => {
        const candidate = byTempId.get(classification.sourceId);
        return candidate?.pubTypes ? applyPubmedTypeOverride(classification, candidate.pubTypes) : classification;
      });

      classification = toStageResult(classificationArraySchema, {
        stage: 'classify',
        status: truncated ? 'partial' : 'ok',
        value: overridden,
        reasons: truncated ? [`${retrieval.value.length - MAX_SOURCES_PER_CLASSIFY_CALL} candidate(s) left unclassified (40/call cap)`] : undefined,
        metrics: { ms: classifyMs, costUsd: classifyAgentResult.usage.costUsd },
      });
    } else {
      classification = toStageResult(classificationArraySchema, {
        stage: 'classify',
        status: 'failed',
        reasons: [classifyAgentResult.detail],
        metrics: { ms: classifyMs, costUsd: 0 },
      });
    }
  }

  return { structure, plan, retrieval, classification };
}
