import type { CandidateSource } from '../schemas/retrieval';
import { detectQueryShape, extractSearchHints, isDistinctiveTerm, tokenizeWords } from './seed-search-plan';
export interface RetrievalSufficiency {
  status: 'empty' | 'off_topic' | 'thin' | 'sufficient';
  reason: string;
  relevantCount: number;
  candidateCount: number;
  distinctFamilies: number;
}
/** Priority is lexical evidence of topic fit, never a scientific exclusion verdict. */
export function prioritizeSources(query: string, sources: CandidateSource[]) {
  const queryTerms = extractSearchHints(query).terms;
  const terms = queryTerms.map((term) => term.toLowerCase());
  // 2026-11-02 fix (docs/DECISIONS.md): when the query names a specific entity
  // (e.g. "SP-A"), a title that shares only generic words ("respiratory",
  // "mechanism") and never the entity itself is not actually relevant evidence
  // — see `isDistinctiveTerm`. No distinctive term in the query (most plain
  // questions) falls back to the original any-term-matches behavior.
  const distinctiveTerms = new Set(queryTerms.filter(isDistinctiveTerm).map((term) => term.toLowerCase()));
  const associationRequest = /\b(associated|association|susceptibility|top|most|asociad[oa]s?|principales|m[aá]s)\b/i.test(query);
  return sources.map((source, index) => {
    const title = source.title.toLowerCase();
    // 2026-11-01 fix (docs/DECISIONS.md): whole-word set membership, not
    // `title.includes(term)` — a raw substring check let a short garbled term
    // (e.g. "mo") match inside an unrelated longer word (e.g. "hemoterapia"),
    // which made an off-topic result look "relevant" and suppressed the
    // semantic-rescue escalation below.
    const titleWords = new Set(tokenizeWords(title).map((word) => word.toLowerCase()));
    const matched = terms.filter((term) => titleWords.has(term));
    const matchedDistinctive = matched.filter((term) => distinctiveTerms.has(term));
    const evidenceFit = associationRequest
      ? [/(?:genome-wide association|gwas|transcriptome-wide association|twas)/, /(?:genetic|gene|genes|locus|loci|susceptibility)/, /(?:systematic review|meta-analysis|review)/]
          .reduce((score, pattern) => score + Number(pattern.test(title)), 0)
      : 0;
    const lexical = terms.length ? matched.length / terms.length : 0;
    const score = lexical + evidenceFit * 0.2;
    // A distinctive query term (a named entity) that's entirely absent from an
    // otherwise-matching title is the strongest signal this title is actually
    // off-topic — zero the score rather than let generic-word overlap alone
    // carry it, but only when the query HAS a distinctive term to check.
    const relevant = distinctiveTerms.size === 0 ? score > 0 : matchedDistinctive.length > 0;
    const reason = evidenceFit > 0
      ? `Title matches ${evidenceFit} association-evidence signal(s) and ${matched.length} explicit query term(s)`
      : matched.length ? 'Explicit query terms in title' : 'Title fit uncertain; retained for later review';
    return { source, index, matched, matchedDistinctive, score, relevant, reason };
  }).sort((a, b) => b.score - a.score || a.index - b.index);
}

/** Decides whether a complex query needs semantic rescue; never discards sources. */
export function assessRetrievalSufficiency(query: string, sources: CandidateSource[]): RetrievalSufficiency {
  if (!sources.length) return { status: 'empty', reason: 'No candidates returned by the initial search', relevantCount: 0, candidateCount: 0, distinctFamilies: 0 };
  const ranked = prioritizeSources(query, sources);
  const relevantCount = ranked.filter((entry) => entry.relevant).length;
  const distinctFamilies = new Set(sources.map((source) => source.family)).size;
  if (relevantCount === 0) return { status: 'off_topic', reason: 'No title contains query concepts or intent-specific evidence signals', relevantCount, candidateCount: sources.length, distinctFamilies };
  const shape = detectQueryShape(query);
  // 2026-11-02 fix (docs/DECISIONS.md): `required: 1` for a 'general'-shaped
  // question let a single title that only shares common, non-specific words
  // with the query (e.g. "respiratory"/"distress" alone, matching an entirely
  // unrelated disease's title) count as "sufficient" and silently suppress the
  // P3 semantic rescue — reproduced live for "How SP-A mutations produce
  // respiratory distress?": every one of 16 retrieved candidates was
  // off-topic, yet the one Toll-like-receptor/ARDS title sharing those two
  // generic words alone made the whole retrieval look "sufficient."
  const required = shape === 'general' ? 2 : 3;
  if (relevantCount < required) return { status: 'thin', reason: `Only ${relevantCount} relevant candidate(s) for a ${shape} question`, relevantCount, candidateCount: sources.length, distinctFamilies };
  return { status: 'sufficient', reason: `${relevantCount} candidates passed the fast relevance screen`, relevantCount, candidateCount: sources.length, distinctFamilies };
}
