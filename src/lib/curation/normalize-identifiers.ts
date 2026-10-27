import { normalizeDoi } from '../tools/crossref';

// Module 02 deterministic curation, step 1: "Normalize identifiers: DOI lower-case,
// PMID, URL canonicalization." normalizeDoi lives in tools/crossref.ts (it already
// needs it to look up a DOI) and is re-exported here as part of the full identifier
// set curation uses.

export { normalizeDoi };

const TRACKING_PARAM_PREFIXES = ['utm_', 'fbclid', 'gclid', 'mc_cid', 'mc_eid'];

/** Lower-cases the host, strips the fragment and tracking params, and drops a trailing slash. */
export function normalizeUrl(rawUrl: string): string {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return rawUrl.trim();
  }

  url.hash = '';
  url.hostname = url.hostname.toLowerCase();

  const keysToDelete: string[] = [];
  for (const key of url.searchParams.keys()) {
    if (TRACKING_PARAM_PREFIXES.some((prefix) => key.toLowerCase().startsWith(prefix))) {
      keysToDelete.push(key);
    }
  }
  for (const key of keysToDelete) url.searchParams.delete(key);

  let result = url.toString();
  if (url.pathname !== '/' && result.endsWith('/')) {
    result = result.slice(0, -1);
  }
  return result;
}

/** Strips an optional "PMID:" label and surrounding whitespace. */
export function normalizePmid(rawPmid: string): string {
  return rawPmid.replace(/^pmid:?\s*/i, '').trim();
}
