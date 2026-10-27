import type { CrossrefClient } from '../tools/crossref';
import type { PubmedClient } from '../tools/pubmed';

// Module 03 deterministic verification, step 1: "Exists: DOI resolves via Crossref or
// PMID via PubMed or URL returns 2xx with readable text." Checked in that priority
// order — a source with a DOI is checked by DOI only, not also by its URL.

export interface ExistenceCheckInput {
  doi?: string;
  pmid?: string;
  url: string;
}

export interface ExistenceCheckDeps {
  crossref: CrossrefClient;
  pubmed: PubmedClient;
  checkUrlReachable: (url: string) => Promise<{ status: number }>;
}

export type ExistenceCheckResult =
  | { exists: true; method: 'doi' | 'pmid' | 'url' }
  | { exists: false; method: 'doi' | 'pmid' | 'url'; reason: string };

export async function checkSourceExists(
  input: ExistenceCheckInput,
  deps: ExistenceCheckDeps,
): Promise<ExistenceCheckResult> {
  if (input.doi) {
    const work = await deps.crossref.lookup(input.doi);
    return work
      ? { exists: true, method: 'doi' }
      : { exists: false, method: 'doi', reason: `DOI "${input.doi}" did not resolve via Crossref` };
  }

  if (input.pmid) {
    const summaries = await deps.pubmed.fetchSummaries([input.pmid]);
    return summaries.length > 0
      ? { exists: true, method: 'pmid' }
      : { exists: false, method: 'pmid', reason: `PMID "${input.pmid}" not found via PubMed` };
  }

  const res = await deps.checkUrlReachable(input.url);
  return res.status >= 200 && res.status < 300
    ? { exists: true, method: 'url' }
    : { exists: false, method: 'url', reason: `URL returned HTTP ${res.status}` };
}
