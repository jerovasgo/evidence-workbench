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
  status: 'retracted' | 'checked_no_signal' | 'unknown';
  reason?: string;
}

/** A negative check is limited to the consulted sources; it is not proof of validity. */
export async function checkRetraction(
  input: RetractionCheckInput,
  deps: { crossref: CrossrefClient },
): Promise<RetractionCheckResult> {
  if (input.pubmedSummary) {
    const hit = input.pubmedSummary.pubTypes.find((t) => PUBMED_RETRACTION_TYPES.has(t.toLowerCase()));
    if (hit) return { status: 'retracted', reason: `PubMed publication type "${hit}"` };
  }
  if (input.fetchedText && detectWithdrawalBanner(input.fetchedText)) {
    return { status: 'retracted', reason: 'Withdrawal/archived banner found in fetched text' };
  }
  if (!input.doi) return { status: 'unknown', reason: 'No DOI available for Crossref status check' };
  try {
    const work = await deps.crossref.lookup(input.doi);
    if (!work) return { status: 'unknown', reason: 'DOI not found in Crossref' };
    if (work.retracted) {
      const notice = work.updateNotices.find((n) => n.type === 'retraction');
      return { status: 'retracted', reason: `Crossref retraction notice (${notice?.doi ?? 'unknown DOI'})` };
    }
    return { status: 'checked_no_signal' };
  } catch {
    return { status: 'unknown', reason: 'Crossref status check unavailable' };
  }
}

export function detectWithdrawalBanner(text: string): boolean {
  return WITHDRAWAL_BANNER_PATTERNS.some((pattern) => pattern.test(text));
}
