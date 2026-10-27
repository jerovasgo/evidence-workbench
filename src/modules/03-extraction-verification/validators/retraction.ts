import type { CrossrefClient } from '@/modules/02-retrieval';
import type { PubmedSummary } from '@/modules/02-retrieval';

// Module 03 step 4 / module 02 step 4: "Retraction/withdrawal check: Crossref update
// notices + PubMed 'Retracted Publication'/'Retraction of Publication' types +
// guideline 'withdrawn/archived' banners found in fetched text." Shared by curation
// (module 02, excludes retracted sources from the pool) and verification (module 03,
// re-checks at display time) so the logic lives in one place.

const PUBMED_RETRACTION_TYPES = new Set(['retracted publication', 'retraction of publication']);

const WITHDRAWAL_BANNER_PATTERNS: RegExp[] = [
  /this (guideline|document|article) has been withdrawn/i,
  /\barchived\b.{0,40}\bno longer (current|active|in effect)\b/i,
  /no longer (current|active|in effect|recommended for use)/i,
  /superseded by/i,
];

export interface RetractionCheckInput {
  doi?: string;
  pubmedSummary?: PubmedSummary;
  fetchedText?: string;
}

export interface RetractionCheckResult {
  retracted: boolean;
  reason?: string;
}

export async function checkRetraction(
  input: RetractionCheckInput,
  deps: { crossref: CrossrefClient },
): Promise<RetractionCheckResult> {
  if (input.pubmedSummary) {
    const hit = input.pubmedSummary.pubTypes.find((t) => PUBMED_RETRACTION_TYPES.has(t.toLowerCase()));
    if (hit) return { retracted: true, reason: `PubMed publication type "${hit}"` };
  }

  if (input.doi) {
    const work = await deps.crossref.lookup(input.doi);
    if (work?.retracted) {
      const notice = work.updateNotices.find((n) => n.type === 'retraction');
      return { retracted: true, reason: `Crossref retraction notice (${notice?.doi ?? 'unknown DOI'})` };
    }
  }

  if (input.fetchedText && detectWithdrawalBanner(input.fetchedText)) {
    return { retracted: true, reason: 'Withdrawal/archived banner found in fetched text' };
  }

  return { retracted: false };
}

export function detectWithdrawalBanner(text: string): boolean {
  return WITHDRAWAL_BANNER_PATTERNS.some((pattern) => pattern.test(text));
}
