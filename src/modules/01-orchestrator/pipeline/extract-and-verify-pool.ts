import type { AgentTraceEvent } from '@/shared/agents';
import type { Claim } from '@/shared/domain';
import type { MetaClient } from '@/shared/meta';
import type { BudgetGuard } from '@/shared/security';
import {
  fetchFullTextForCandidate,
  type CandidateSource,
  type CrossrefClient,
  type EuropePmcClient,
  type SourceClassification,
} from '@/modules/02-retrieval';
import { extractAndVerifySource } from '@/modules/03-extraction-verification';

// Fetch-full-text + extract + verify, per candidate, run with bounded concurrency —
// the time-to-first-token piece: `onSourceDone` fires as EACH source finishes, not
// once at the end, so a caller (the SSE route) can stream the first source's
// verified claims (~9-10s per a live smoke test) while the rest are still in
// flight, instead of waiting for the whole pool. Capped to `maxSources` (default
// 10) and prioritized by evidence kind (guideline/local_protocol > systematic
// review > RCT > everything else) rather than processing every deduped candidate —
// a real ranking (module 02's `scoring/score.ts`) isn't wired in yet (SECURITY.md
// known gap), but "prefer stronger evidence first" is a reasonable, principled
// stand-in using what classification already produced, and keeps latency/cost
// bounded regardless of how large the retrieved pool is.

const KIND_PRIORITY: Record<string, number> = { guideline: 3, local_protocol: 3, systematic_review: 2, rct: 1 };
const DEFAULT_MAX_SOURCES = 10;
const DEFAULT_MAX_CONCURRENCY = 6;

export type PoolSourceOutcome =
  | { status: 'no_full_text' }
  | { status: 'extraction_failed'; reason: string }
  | { status: 'ok'; claims: Claim[]; dropped: { reason: string }[]; costUsd: number };

export interface ExtractAndVerifyPoolInput {
  runId: string;
  candidates: CandidateSource[];
  /** Used only to prioritize which sources to spend extraction budget on. */
  classifications: SourceClassification[];
  subQuestions: string[];
  maxSources?: number;
  maxConcurrency?: number;
}

export interface ExtractAndVerifyPoolDeps {
  metaClient: MetaClient;
  budgetGuard: BudgetGuard;
  crossref: CrossrefClient;
  europePmc: EuropePmcClient;
  /** Lets `web`/`guideline`-family candidates re-fetch their own URL for extraction; omit to leave them as no_full_text. */
  webFetch?: { allowedDomains: readonly string[]; fetchImpl?: typeof fetch };
  p0Preamble: string;
  p5PromptTemplate: string;
  onSourceDone?: (sourceId: string, outcome: PoolSourceOutcome) => void;
  onTrace?: (event: AgentTraceEvent) => void;
}

export interface ExtractAndVerifyPoolResult {
  claims: Claim[];
  perSource: { sourceId: string; outcome: PoolSourceOutcome }[];
  costUsd: number;
}

export async function extractAndVerifyPool(
  input: ExtractAndVerifyPoolInput,
  deps: ExtractAndVerifyPoolDeps,
): Promise<ExtractAndVerifyPoolResult> {
  const kindBySourceId = new Map(input.classifications.map((c) => [c.sourceId, c.kind]));
  const priorityOf = (c: CandidateSource) => KIND_PRIORITY[kindBySourceId.get(c.tempId) ?? ''] ?? 0;
  const selected = [...input.candidates].sort((a, b) => priorityOf(b) - priorityOf(a)).slice(0, input.maxSources ?? DEFAULT_MAX_SOURCES);
  const maxConcurrency = input.maxConcurrency ?? DEFAULT_MAX_CONCURRENCY;

  const claims: Claim[] = [];
  const perSource: { sourceId: string; outcome: PoolSourceOutcome }[] = [];
  let totalCostUsd = 0;

  async function processOne(candidate: CandidateSource): Promise<void> {
    const fullText = await fetchFullTextForCandidate(candidate, deps.europePmc, deps.webFetch);

    let outcome: PoolSourceOutcome;
    if (!fullText) {
      outcome = { status: 'no_full_text' };
    } else {
      const result = await extractAndVerifySource(
        {
          runId: input.runId,
          sourceId: candidate.tempId,
          sourceTitle: candidate.title,
          fullText,
          subQuestions: input.subQuestions,
          doi: candidate.doi,
          pubTypes: candidate.pubTypes,
        },
        {
          metaClient: deps.metaClient,
          budgetGuard: deps.budgetGuard,
          crossref: deps.crossref,
          p0Preamble: deps.p0Preamble,
          p5PromptTemplate: deps.p5PromptTemplate,
          onTrace: deps.onTrace,
        },
      );

      if (result.status === 'no_text') outcome = { status: 'no_full_text' };
      else if (result.status === 'extraction_failed') outcome = { status: 'extraction_failed', reason: result.reason };
      else {
        outcome = { status: 'ok', claims: result.claims, dropped: result.dropped, costUsd: result.costUsd };
        claims.push(...result.claims);
        totalCostUsd += result.costUsd;
      }
    }

    perSource.push({ sourceId: candidate.tempId, outcome });
    deps.onSourceDone?.(candidate.tempId, outcome);
  }

  let next = 0;
  async function worker(): Promise<void> {
    for (;;) {
      const i = next++;
      if (i >= selected.length) return;
      await processOne(selected[i]!);
    }
  }
  await Promise.all(Array.from({ length: Math.min(maxConcurrency, selected.length) }, worker));

  return { claims, perSource, costUsd: totalCostUsd };
}
