import type { AgentTraceEvent } from '@/shared/agents';
import type { MetaClient } from '@/shared/meta';
import type { BudgetGuard } from '@/shared/security';
import type { Relation } from '@/shared/domain';
import type { ClaimPair } from '../pipeline/pair-claims';
import { labelRelations } from './relation-labeller';

// Pooling layer over `labelRelations` (P7), mirroring
// `classify-sources-batched.ts`'s pattern from the 2026-10-28 latency audit:
// the single-call primitive stays untouched; this just splits the candidate
// pairs into fixed-size batches (<=10/call, the architecture doc's limit) and
// runs them with bounded concurrency. Always runs after the SSE `done` event
// for the Evidence view, so there is no TTFT to protect here — concurrency is
// still bounded to respect the per-run cost/rate budget (CLAUDE.md rule 11).

const DEFAULT_BATCH_SIZE = 10;
const DEFAULT_MAX_CONCURRENCY = 4;

export interface LabelRelationsBatchedDeps {
  metaClient: MetaClient;
  budgetGuard: BudgetGuard;
  p0Preamble: string;
  p7PromptTemplate: string;
  onTrace?: (event: AgentTraceEvent) => void;
  batchSize?: number;
  maxConcurrency?: number;
}

export interface LabelRelationsBatchedResult {
  relations: Relation[];
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

export async function labelRelationsBatched(
  runId: string,
  pairs: ClaimPair[],
  deps: LabelRelationsBatchedDeps,
): Promise<LabelRelationsBatchedResult> {
  const batchSize = deps.batchSize ?? DEFAULT_BATCH_SIZE;
  const maxConcurrency = deps.maxConcurrency ?? DEFAULT_MAX_CONCURRENCY;

  const batches: ClaimPair[][] = [];
  for (let i = 0; i < pairs.length; i += batchSize) batches.push(pairs.slice(i, i + batchSize));

  const batchResults = await mapWithConcurrency(batches, maxConcurrency, (batch) =>
    labelRelations(runId, batch, {
      metaClient: deps.metaClient,
      budgetGuard: deps.budgetGuard,
      p0Preamble: deps.p0Preamble,
      p7PromptTemplate: deps.p7PromptTemplate,
      onTrace: deps.onTrace,
    }),
  );

  const relations: Relation[] = [];
  const failures: { reason: string }[] = [];
  let costUsd = 0;

  for (const result of batchResults) {
    if (result.ok) {
      relations.push(...result.value.relations);
      costUsd += result.usage.costUsd;
    } else {
      failures.push({ reason: result.detail });
    }
  }

  return { relations, failures, costUsd };
}
