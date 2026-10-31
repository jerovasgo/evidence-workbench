import type { CandidateSource } from '../schemas/retrieval';
import { detectQueryShape, extractSearchHints } from './seed-search-plan';
export interface RetrievalSufficiency {
  status: 'empty' | 'off_topic' | 'thin' | 'sufficient';
  reason: string;
  relevantCount: number;
  candidateCount: number;
  distinctFamilies: number;
}
/** Priority is lexical evidence of topic fit, never a scientific exclusion verdict. */
export function prioritizeSources(query: string, sources: CandidateSource[]) {
  const terms = extractSearchHints(query).terms.map((term) => term.toLowerCase());
  const associationRequest = /\b(associated|association|susceptibility|top|most|asociad[oa]s?|principales|m[aá]s)\b/i.test(query);
  return sources.map((source, index) => {
    const title = source.title.toLowerCase();
    const matched = terms.filter((term) => title.includes(term));
    const evidenceFit = associationRequest
      ? [/(?:genome-wide association|gwas|transcriptome-wide association|twas)/, /(?:genetic|gene|genes|locus|loci|susceptibility)/, /(?:systematic review|meta-analysis|review)/]
          .reduce((score, pattern) => score + Number(pattern.test(title)), 0)
      : 0;
    const lexical = terms.length ? matched.length / terms.length : 0;
    const score = lexical + evidenceFit * 0.2;
    const reason = evidenceFit > 0
      ? `Title matches ${evidenceFit} association-evidence signal(s) and ${matched.length} explicit query term(s)`
      : matched.length ? 'Explicit query terms in title' : 'Title fit uncertain; retained for later review';
    return { source, index, matched, score, reason };
  }).sort((a, b) => b.score - a.score || a.index - b.index);
}

/** Decides whether a complex query needs semantic rescue; never discards sources. */
export function assessRetrievalSufficiency(query: string, sources: CandidateSource[]): RetrievalSufficiency {
  if (!sources.length) return { status: 'empty', reason: 'No candidates returned by the initial search', relevantCount: 0, candidateCount: 0, distinctFamilies: 0 };
  const ranked = prioritizeSources(query, sources);
  const relevantCount = ranked.filter((entry) => entry.score > 0).length;
  const distinctFamilies = new Set(sources.map((source) => source.family)).size;
  if (relevantCount === 0) return { status: 'off_topic', reason: 'No title contains query concepts or intent-specific evidence signals', relevantCount, candidateCount: sources.length, distinctFamilies };
  const shape = detectQueryShape(query);
  const required = shape === 'general' ? 1 : 3;
  if (relevantCount < required) return { status: 'thin', reason: `Only ${relevantCount} relevant candidate(s) for a ${shape} question`, relevantCount, candidateCount: sources.length, distinctFamilies };
  return { status: 'sufficient', reason: `${relevantCount} candidates passed the fast relevance screen`, relevantCount, candidateCount: sources.length, distinctFamilies };
}
