import type { AgentTraceEvent } from '@/shared/agents';
import type { Claim } from '@/shared/domain';
import type { MetaClient } from '@/shared/meta';
import type { BudgetGuard } from '@/shared/security';
import type { CrossrefClient } from '@/modules/02-retrieval';
import { extractClaims } from '../agents/claim-extractor';
import { windowText } from '../passages/window-text';
import { checkRetraction } from '../validators/retraction';
import { verifyClaim } from './verify-claim';

// Module 03, "one call per source, run in parallel" (claim-extractor, P5) followed by
// deterministic verification — the whole `curate -> extract -> verify` slice for a
// single already-fetched source. Callers (module 01) run this per source with
// bounded concurrency so one slow/large source never blocks another's claims from
// becoming available — the TTFT goal this was built for.

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

  const extractResult = await extractClaims(
    input.runId,
    {
      sourceTitle: input.sourceTitle,
      passages: passages.map((p) => ({ passageId: p.id, locator: p.locator, text: p.text })),
      subQuestions: input.subQuestions,
    },
    { metaClient: deps.metaClient, budgetGuard: deps.budgetGuard, p0Preamble: deps.p0Preamble, p5PromptTemplate: deps.p5PromptTemplate, onTrace: deps.onTrace },
  );

  if (!extractResult.ok) {
    return { sourceId: input.sourceId, status: 'extraction_failed', reason: extractResult.detail };
  }

  // Step 4 ("not retracted") is source-level: computed once, applied to every claim
  // from this source, rather than re-checked per claim.
  const retraction = await checkRetraction(
    {
      doi: input.doi,
      pubmedSummary: input.pubTypes ? { pmid: input.sourceId, title: input.sourceTitle, pubTypes: input.pubTypes } : undefined,
      fetchedText: input.fullText,
    },
    { crossref: deps.crossref },
  );

  const claims: Claim[] = [];
  const dropped: { reason: string }[] = [];
  for (const extracted of extractResult.value.claims) {
    const verified = verifyClaim({ extracted, sourceId: input.sourceId, retracted: retraction.retracted }, passages);
    if (verified.outcome === 'kept') claims.push(verified.claim);
    else dropped.push({ reason: verified.reason });
  }

  return { sourceId: input.sourceId, status: 'ok', claims, dropped, costUsd: extractResult.usage.costUsd };
}
