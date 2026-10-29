import type { EuropePmcClient } from '../tools/europe-pmc';
import { fetchUrlText } from '../tools/fetch-url-text';
import type { CandidateSource } from '../schemas/retrieval';

// Module 03 needs full text to extract/verify claims against. Europe PMC is the
// only full-text connector built (module 02's own note: "Europe PMC ... preferred
// for quote verification"). For a `europe_pmc`-family candidate the (source, id)
// pair is recovered from its `tempId` (`europe_pmc:<source>:<id>`, set by
// `execute-plan.ts`); for a `pubmed`-family candidate there is no such pair, but
// Europe PMC indexes PubMed content too, so `source: 'MED'` with the PMID is tried
// as a best-effort — it 404s (returns null, not an error) for the (most) non-open-
// access PubMed records, which is correctly treated as "no full text available",
// not a failure.
//
// `web`/`guideline`-family candidates already carry a real, fetchable `url`
// (`execute-plan.ts`'s `runWebQuery` found and allow-list-checked it) — this
// re-fetches it directly via `fetch_url_text` rather than reusing any text read
// during discovery, per module 03's own build note: "refetch when re-verification
// is needed", not "store full text". `webFetch` is optional so a caller that never
// wired `webSearch` into retrieval (e.g. existing tests) still gets `null` for
// these families instead of a crash.

export interface WebFetchOptions {
  allowedDomains: readonly string[];
  fetchImpl?: typeof fetch;
}

export async function fetchFullTextForCandidate(
  candidate: CandidateSource,
  europePmc: EuropePmcClient,
  webFetch?: WebFetchOptions,
): Promise<string | null> {
  if (candidate.family === 'europe_pmc') {
    const [, source, id] = candidate.tempId.split(':');
    if (!source || !id) return null;
    return europePmc.fetchFullText(source, id);
  }

  if (candidate.family === 'pubmed' && candidate.pmid) {
    return europePmc.fetchFullText('MED', candidate.pmid);
  }

  if ((candidate.family === 'web' || candidate.family === 'standards_body') && webFetch) {
    try {
      // fetchUrlText already extracts readable text from the raw HTML/XML body.
      const page = await fetchUrlText(candidate.url, { allowedDomains: webFetch.allowedDomains, fetchImpl: webFetch.fetchImpl });
      return page.text;
    } catch {
      return null;
    }
  }

  return null;
}
