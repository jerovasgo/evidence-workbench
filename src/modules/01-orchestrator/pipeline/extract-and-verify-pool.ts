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
// flight, instead of waiting for the whole pool. Interactive runs use a soft
// exploration deadline: workers stop starting new sources when it expires, while
// already-running verification completes. Candidates are prioritized by evidence
// kind (meta_analysis/standards_body/local_protocol > systematic review >
// controlled experiment > everything else) —
// a real ranking (module 02's `scoring/score.ts`) isn't wired in yet (SECURITY.md
// known gap), but "prefer stronger evidence first" is a reasonable, principled
// stand-in using what classification already produced. The run budget guard
// independently limits cost.

const DEFAULT_MAX_CONCURRENCY = 6;

export type PoolSourceOutcome =
  | { status: 'no_full_text' }
  | { status: 'extraction_failed'; reason: string }
  | { status: 'ok'; claims: Claim[]; dropped: { reason: string }[]; withdrawn: { id: string; reason: string }[]; costUsd: number };

export interface ExtractAndVerifyPoolInput {
  runId: string;
  candidates: CandidateSource[];
  /** Used only to prioritize which sources to spend extraction budget on. */
  classifications: SourceClassification[];
  subQuestions: string[];
  maxSources?: number;
  /** Soft time window: stop starting new sources when elapsed; in-flight verification completes. */
  timeBudgetMs?: number;
  maxConcurrency?: number;
}

export interface ExtractAndVerifyPoolDeps {
  metaClient: MetaClient;
  budgetGuard: BudgetGuard;
  crossref: CrossrefClient;
  europePmc: EuropePmcClient;
  /** Lets `web`/`standards_body`-family candidates re-fetch their own URL for extraction; omit to leave them as no_full_text. */
  webFetch?: { allowedDomains: readonly string[]; fetchImpl?: typeof fetch };
  p0Preamble: string;
  p5PromptTemplate: string;
  p10PromptTemplate: string;
  onSourceDone?: (sourceId: string, outcome: PoolSourceOutcome) => void;
  onProvisionalClaims?: (sourceId: string, claims: Claim[]) => void;
  onTrace?: (event: AgentTraceEvent) => void;
}

export interface ExtractAndVerifyPoolResult {
  claims: Claim[];
  perSource: { sourceId: string; outcome: PoolSourceOutcome }[];
  costUsd: number;
  sourcesNotStarted: number;
}

export async function extractAndVerifyPool(
  input: ExtractAndVerifyPoolInput,
  deps: ExtractAndVerifyPoolDeps,
): Promise<ExtractAndVerifyPoolResult> {
  // Preserve retrieval order. Study type is reported later; it must not decide
  // which relevant sources enter the time window first.
  const selected = [...input.candidates];
  if (input.maxSources !== undefined) selected.length = Math.min(selected.length, input.maxSources);
  const maxConcurrency = input.maxConcurrency ?? DEFAULT_MAX_CONCURRENCY;
  const deadline = input.timeBudgetMs === undefined ? Infinity : Date.now() + input.timeBudgetMs;

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
          p10PromptTemplate: deps.p10PromptTemplate,
          onTrace: deps.onTrace,
          onProvisionalClaims: (claims) => deps.onProvisionalClaims?.(candidate.tempId, claims),
        },
      );

      if (result.status === 'no_text') outcome = { status: 'no_full_text' };
      else if (result.status === 'extraction_failed') outcome = { status: 'extraction_failed', reason: result.reason };
      else {
        outcome = { status: 'ok', claims: result.claims, dropped: result.dropped, withdrawn: result.withdrawn, costUsd: result.costUsd };
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
      if (Date.now() >= deadline) return;
      const i = next++;
      if (i >= selected.length) return;
      await processOne(selected[i]!);
    }
  }
  await Promise.all(Array.from({ length: Math.min(maxConcurrency, selected.length) }, worker));

  return { claims, perSource, costUsd: totalCostUsd, sourcesNotStarted: Math.max(0, selected.length - Math.min(next, selected.length)) };
}
