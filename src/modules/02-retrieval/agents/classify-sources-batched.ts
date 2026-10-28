import type { AgentTraceEvent } from '@/shared/agents';
import type { MetaClient } from '@/shared/meta';
import type { BudgetGuard } from '@/shared/security';
import type { SourceClassification, SourceToClassify } from '../schemas/classification';
import { classifySources } from './source-classifier';

// 2026-10-28 latency audit (docs/DECISIONS.md): `classifySources` (P4) batches up to
// 40 sources into ONE serial model call — live traces measured 18.6-29.5s for that,
// consistently the slowest stage in the pipeline, at the same T0/minimal tier as
// structure/plan (2.4-5.1s). The gap is output size (up to ~4800 tokens of JSON in
// one generation), not reasoning, so splitting into smaller batches run with bounded
// concurrency (the same pattern already used for retrieve/extract) should cut wall-
// clock time to roughly one small batch's duration instead of one giant one's.
// `classifySources` itself is untouched — still the single-call primitive every
// other agent in this codebase follows; this is the pooling layer on top of it,
// mirroring module 01's `extract-and-verify-pool.ts` for the same reason.

const DEFAULT_BATCH_SIZE = 10;
const DEFAULT_MAX_CONCURRENCY = 4;

export interface ClassifySourcesBatchedDeps {
  metaClient: MetaClient;
  budgetGuard: BudgetGuard;
  p0Preamble: string;
  p4PromptTemplate: string;
  onTrace?: (event: AgentTraceEvent) => void;
  batchSize?: number;
  maxConcurrency?: number;
}

export interface ClassifySourcesBatchedResult {
  classifications: SourceClassification[];
  /** One entry per batch that failed (timeout/invalid/budget/abstain) — the caller decides partial vs failed from this plus whether anything came back. */
  failures: { reason: string }[];
  costUsd: number;
}

/** Runs `fn` over `items` with at most `limit` in flight at once. */
async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;

  async function worker(): Promise<void> {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      results[i] = await fn(items[i]!);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

export async function classifySourcesBatched(
  runId: string,
  sources: SourceToClassify[],
  deps: ClassifySourcesBatchedDeps,
): Promise<ClassifySourcesBatchedResult> {
  const batchSize = deps.batchSize ?? DEFAULT_BATCH_SIZE;
  const maxConcurrency = deps.maxConcurrency ?? DEFAULT_MAX_CONCURRENCY;

  const batches: SourceToClassify[][] = [];
  for (let i = 0; i < sources.length; i += batchSize) batches.push(sources.slice(i, i + batchSize));

  const batchResults = await mapWithConcurrency(batches, maxConcurrency, (batch) =>
    classifySources(
      runId,
      { sources: batch },
      { metaClient: deps.metaClient, budgetGuard: deps.budgetGuard, p0Preamble: deps.p0Preamble, p4PromptTemplate: deps.p4PromptTemplate, onTrace: deps.onTrace },
    ),
  );

  const classifications: SourceClassification[] = [];
  const failures: { reason: string }[] = [];
  let costUsd = 0;

  for (const result of batchResults) {
    if (result.ok) {
      classifications.push(...result.value.classifications);
      costUsd += result.usage.costUsd;
    } else {
      failures.push({ reason: result.detail });
    }
  }

  return { classifications, failures, costUsd };
}
