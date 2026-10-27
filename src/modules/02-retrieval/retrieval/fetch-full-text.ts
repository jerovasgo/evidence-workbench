import type { EuropePmcClient } from '../tools/europe-pmc';
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

export async function fetchFullTextForCandidate(candidate: CandidateSource, europePmc: EuropePmcClient): Promise<string | null> {
  if (candidate.family === 'europe_pmc') {
    const [, source, id] = candidate.tempId.split(':');
    if (!source || !id) return null;
    return europePmc.fetchFullText(source, id);
  }

  if (candidate.family === 'pubmed' && candidate.pmid) {
    return europePmc.fetchFullText('MED', candidate.pmid);
  }

  return null;
}
