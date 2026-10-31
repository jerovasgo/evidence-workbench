import type { AgentTraceEvent } from '@/shared/agents';
import type { Claim } from '@/shared/domain';
import type { MetaClient } from '@/shared/meta';
import type { BudgetGuard } from '@/shared/security';
import type { CrossrefClient } from '@/modules/02-retrieval';
import { extractClaims } from '../agents/claim-extractor';
import { judgeSupport } from '../agents/support-judge';
import { beginsResearchSection, windowText } from '../passages/window-text';
import { checkRetraction } from '../validators/retraction';
import { extractSurroundingContext } from './support-context';
import { applySupportJudgment, verifyClaim } from './verify-claim';
import { normalizeForMatch } from '../validators/quote';
import { buildVerificationReport } from './verification-report';

// Module 03, "one call per source, run in parallel" (claim-extractor, P5) followed by
// deterministic verification, followed by the support-judge (P10) — the whole
// `curate -> extract -> verify -> judge` slice for a single already-fetched source.
// Callers (module 01) run this per source with bounded concurrency so one slow/large
// source never blocks another's claims from becoming available — the TTFT goal this
// was built for. Within a source, the P10 judge calls (one per kept claim) also run
// with bounded concurrency rather than one per source, since a source's claim count
// varies and a single claim's judge call must never be the slow path.
const MAX_JUDGE_CONCURRENCY = 4;
const MAX_EXTRACT_CONCURRENCY = 2;
const MAX_PASSAGES_PER_EXTRACTION = 4;

export function batchPassagesForExtraction<T extends { text: string }>(passages: T[]): T[][] {
  const batches: T[][] = [];
  let batch: T[] = [];
  for (const passage of passages) {
    if (batch.length && (batch.length >= MAX_PASSAGES_PER_EXTRACTION || beginsResearchSection(passage.text))) {
      batches.push(batch);
      batch = [];
    }
    batch.push(passage);
  }
  if (batch.length) batches.push(batch);
  return batches;
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
  /** Located, deterministic-check-passing claims; source and support checks remain pending. */
  onProvisionalClaims?: (claims: Claim[]) => void;
  onTrace?: (event: AgentTraceEvent) => void;
}

export type ExtractAndVerifySourceResult =
  | { sourceId: string; status: 'no_text' }
  | { sourceId: string; status: 'extraction_failed'; reason: string }
  | { sourceId: string; status: 'ok'; claims: Claim[]; qualified: Claim[]; dropped: { reason: string }[]; withdrawn: { id: string; reason: string }[]; costUsd: number };

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
  const retractionPromise = checkRetraction(
    {
      doi: input.doi,
      pubmedSummary: input.pubTypes ? { pmid: input.sourceId, title: input.sourceTitle, pubTypes: input.pubTypes } : undefined,
      fetchedText: input.fullText,
    },
    { crossref: deps.crossref },
  );
  const batches = batchPassagesForExtraction(passages);
  const extractionResults = await mapWithConcurrency(batches, MAX_EXTRACT_CONCURRENCY, (batch) => extractClaims(
    input.runId,
    { sourceTitle: input.sourceTitle, passages: batch.map((p) => ({ passageId: p.id, locator: p.locator, text: p.text })), subQuestions: input.subQuestions },
    { metaClient: deps.metaClient, budgetGuard: deps.budgetGuard, p0Preamble: deps.p0Preamble, p5PromptTemplate: deps.p5PromptTemplate, onTrace: deps.onTrace },
  ));
  const succeeded = extractionResults.filter((result) => result.ok);
  if (succeeded.length === 0) {
    const failed = extractionResults.find((result) => !result.ok);
    return { sourceId: input.sourceId, status: 'extraction_failed', reason: failed && !failed.ok ? failed.detail : 'No extraction batch completed' };
  }
  const extractionCostUsd = succeeded.reduce((sum, result) => sum + result.usage.costUsd, 0);
  const seen = new Set<string>();
  const extractedClaims = succeeded.flatMap((result) => result.value.claims).filter((claim) => {
    const key = `${claim.passageId}:${normalizeForMatch(claim.quote)}:${normalizeForMatch(claim.text)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const verifiedClaims: Claim[] = [];
  const dropped: { reason: string }[] = [];
  for (const extracted of extractedClaims) {
    const verified = verifyClaim({ extracted, sourceId: input.sourceId, retracted: false }, passages);
    if (verified.outcome === 'kept') {
      if (verified.claim.subQuestionIndex !== undefined && verified.claim.subQuestionIndex >= input.subQuestions.length) verified.claim.subQuestionIndex = undefined;
      verifiedClaims.push(verified.claim);
    }
    else dropped.push({ reason: verified.reason });
  }
  if (verifiedClaims.length > 0) deps.onProvisionalClaims?.(verifiedClaims);

  const retraction = await retractionPromise;
  if (retraction.status !== 'checked_no_signal') {
    const reason = retraction.status === 'retracted' ? 'source is retracted or withdrawn' : `retraction status unknown: ${retraction.reason ?? 'check unavailable'}`;
    return { sourceId: input.sourceId, status: 'ok', claims: [], qualified: [], dropped: [...dropped, ...verifiedClaims.map(() => ({ reason }))], withdrawn: verifiedClaims.map((claim) => ({ id: claim.id, reason })), costUsd: extractionCostUsd };
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

  // Only fully supported claims with a completed retraction check enter downstream views.
  const claims: Claim[] = [];
  const qualified: Claim[] = [];
  const withdrawn: { id: string; reason: string }[] = [];
  judged.forEach((claim, index) => {
    const reason = !claim ? 'the cited quote did not support the claim' : claim.verification.support === 'unknown' ? 'source support could not be confirmed' : null;
    if (reason || !claim) {
      const withdrawalReason = reason ?? 'the cited quote did not support the claim';
      dropped.push({ reason: withdrawalReason });
      withdrawn.push({ id: verifiedClaims[index]!.id, reason: withdrawalReason });
      return;
    }
    // A successful Crossref lookup both resolves the DOI and completes the
    // no-signal check. Earlier deterministic checks cannot assert existence.
    claim.verification.exists = true;
    claim.verification.retractionCheck = 'crossref_no_signal';
    claim.verificationReport = buildVerificationReport(claim);
    if (claim.verification.support === 'partial') qualified.push(claim);
    else claims.push(claim);
  });

  return { sourceId: input.sourceId, status: 'ok', claims, qualified, dropped, withdrawn, costUsd: extractionCostUsd + judgeCostUsd };
}
