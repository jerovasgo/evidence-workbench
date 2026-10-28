import type { AgentTraceEvent } from '@/shared/agents';
import type { Claim } from '@/shared/domain';
import type { MetaClient } from '@/shared/meta';
import type { BudgetGuard } from '@/shared/security';
import type { CrossrefClient } from '@/modules/02-retrieval';
import { extractClaims } from '../agents/claim-extractor';
import { judgeSupport } from '../agents/support-judge';
import { windowText } from '../passages/window-text';
import { checkRetraction } from '../validators/retraction';
import { extractSurroundingContext } from './support-context';
import { applySupportJudgment, verifyClaim } from './verify-claim';

// Module 03, "one call per source, run in parallel" (claim-extractor, P5) followed by
// deterministic verification, followed by the support-judge (P10) — the whole
// `curate -> extract -> verify -> judge` slice for a single already-fetched source.
// Callers (module 01) run this per source with bounded concurrency so one slow/large
// source never blocks another's claims from becoming available — the TTFT goal this
// was built for. Within a source, the P10 judge calls (one per kept claim) also run
// with bounded concurrency rather than one per source, since a source's claim count
// varies and a single claim's judge call must never be the slow path.
const MAX_JUDGE_CONCURRENCY = 4;

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

export interface ExtractAndVerifySourceInput {
  runId: string;
  sourceId: string;
  sourceTitle: string;
  fullText: string;
  subQuestions: string[];
  doi?: string;
  /** PubMed publication types, if this source came from the PubMed family (module 02). */
  pubTypes?: string[];
}

export interface ExtractAndVerifySourceDeps {
  metaClient: MetaClient;
  budgetGuard: BudgetGuard;
  crossref: CrossrefClient;
  p0Preamble: string;
  p5PromptTemplate: string;
  p10PromptTemplate: string;
  onTrace?: (event: AgentTraceEvent) => void;
}

export type ExtractAndVerifySourceResult =
  | { sourceId: string; status: 'no_text' }
  | { sourceId: string; status: 'extraction_failed'; reason: string }
  | { sourceId: string; status: 'ok'; claims: Claim[]; dropped: { reason: string }[]; costUsd: number };

export async function extractAndVerifySource(
  input: ExtractAndVerifySourceInput,
  deps: ExtractAndVerifySourceDeps,
): Promise<ExtractAndVerifySourceResult> {
  const passages = windowText(input.sourceId, input.fullText);
  if (passages.length === 0) {
    return { sourceId: input.sourceId, status: 'no_text' };
  }

  // 2026-10-28 latency audit: claim extraction (a model call, up to 25s) and the
  // retraction check (a Crossref lookup) are fully independent — neither reads the
  // other's result — so they run concurrently instead of one `await` after the
  // other. Free latency: this source's total time drops from (extract + retraction)
  // to max(extract, retraction).
  const [extractResult, retraction] = await Promise.all([
    extractClaims(
      input.runId,
      {
        sourceTitle: input.sourceTitle,
        passages: passages.map((p) => ({ passageId: p.id, locator: p.locator, text: p.text })),
        subQuestions: input.subQuestions,
      },
      { metaClient: deps.metaClient, budgetGuard: deps.budgetGuard, p0Preamble: deps.p0Preamble, p5PromptTemplate: deps.p5PromptTemplate, onTrace: deps.onTrace },
    ),
    // Step 4 ("not retracted") is source-level: computed once, applied to every
    // claim from this source, rather than re-checked per claim.
    checkRetraction(
      {
        doi: input.doi,
        pubmedSummary: input.pubTypes ? { pmid: input.sourceId, title: input.sourceTitle, pubTypes: input.pubTypes } : undefined,
        fetchedText: input.fullText,
      },
      { crossref: deps.crossref },
    ),
  ]);

  if (!extractResult.ok) {
    return { sourceId: input.sourceId, status: 'extraction_failed', reason: extractResult.detail };
  }

  const verifiedClaims: Claim[] = [];
  const dropped: { reason: string }[] = [];
  for (const extracted of extractResult.value.claims) {
    const verified = verifyClaim({ extracted, sourceId: input.sourceId, retracted: retraction.retracted }, passages);
    if (verified.outcome === 'kept') verifiedClaims.push(verified.claim);
    else dropped.push({ reason: verified.reason });
  }

  // Step 8 (support-judge, P10) — the last verification step. One call per claim,
  // bounded concurrency (see MAX_JUDGE_CONCURRENCY above). A judge failure
  // (timeout/invalid/budget) is not a pipeline failure: the claim simply keeps the
  // `support: 'unknown'` placeholder `verifyClaim` already gave it (prompts/P10 Notes
  // — abstention here never drops a claim, only a 'no' verdict does).
  let judgeCostUsd = 0;
  const judged = await mapWithConcurrency(verifiedClaims, MAX_JUDGE_CONCURRENCY, async (claim) => {
    const passage = passages.find((p) => p.id === claim.passageId);
    if (!passage) return claim;

    const result = await judgeSupport(
      input.runId,
      {
        claimText: claim.text,
        conditions: claim.conditions,
        quote: claim.quote,
        surroundingContext: extractSurroundingContext(passage.text, claim.quote),
      },
      {
        metaClient: deps.metaClient,
        budgetGuard: deps.budgetGuard,
        p0Preamble: deps.p0Preamble,
        p10PromptTemplate: deps.p10PromptTemplate,
        onTrace: deps.onTrace,
      },
    );

    if (!result.ok) return claim;
    judgeCostUsd += result.usage.costUsd;
    return applySupportJudgment(claim, result.value);
  });

  const claims = judged.filter((c): c is Claim => c !== null);

  return { sourceId: input.sourceId, status: 'ok', claims, dropped, costUsd: extractResult.usage.costUsd + judgeCostUsd };
}
