import {
  APPLICABILITY_WEIGHTS,
  computeCurrency,
  computeSourceScore,
  detectQueryShape,
  extractSearchHints,
  isDistinctiveTerm,
  LEVEL_WEIGHTS,
  tokenizeWords,
  type SourceClassification,
} from '@/modules/02-retrieval';
import type { ScoreBreakdown } from '../schemas/score-breakdown';
import { computeApplicability } from './applicability';
import { computeQuality } from './quality';

// Module 04 source-score: assembles the full 5-factor breakdown the UI shows ("why
// ranked here"), reusing module 02's already-built level/currency math
// (`computeSourceScore`, `computeCurrency`, `LEVEL_WEIGHTS`) rather than re-deriving
// it, so `total` always stays consistent with that function's own formula.
//
// `isSuperseded` is always `false`: `SourceClassification.supersedesOrSupersededBy`
// is one ambiguous free-text field that doesn't say which DIRECTION the relationship
// runs (this source superseding an older one vs. being superseded by a newer one) —
// treating any non-empty value as "this source is outdated" would be a guess, so
// currency never penalizes it here. A known gap (SECURITY.md): the classifier schema
// needs two separate, unambiguous fields before this factor can be scored for real.
export interface SourceRelevanceContext {
  query: string;
  subQuestions?: string[];
  title: string;
  snippet?: string;
  retrievalRelevance?: number;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

/** Auditable lexical relevance: named genes/proteins/variants receive triple
 * weight; title matches count fully and abstract/snippet matches count partially. */
export function computeDeterministicRelevance(context: SourceRelevanceContext): { score: number; reason: string } {
  const questions = [context.query, ...(context.subQuestions ?? [])].filter(Boolean);
  const terms = [...new Map(questions.flatMap((question) => extractSearchHints(question).terms).map((term) => [term.toLowerCase(), term])).values()].slice(0, 24);
  if (!terms.length) {
    const fallback = clamp01(context.retrievalRelevance ?? 0.5);
    return { score: fallback, reason: 'No stable query terms were available; retained the bounded retrieval signal.' };
  }

  const titleWords = new Set(tokenizeWords(context.title).map((word) => word.toLowerCase()));
  const snippetWords = new Set(tokenizeWords(context.snippet ?? '').map((word) => word.toLowerCase()));
  const distinctive = new Set(terms.filter(isDistinctiveTerm).map((term) => term.toLowerCase()));
  const weights = new Map(terms.map((term) => [term.toLowerCase(), distinctive.has(term.toLowerCase()) ? 3 : 1]));
  const totalWeight = [...weights.values()].reduce((sum, weight) => sum + weight, 0);
  const matchedTitle = terms.filter((term) => titleWords.has(term.toLowerCase()));
  const matchedSnippetOnly = terms.filter((term) => !titleWords.has(term.toLowerCase()) && snippetWords.has(term.toLowerCase()));
  const lexicalWeight = matchedTitle.reduce((sum, term) => sum + (weights.get(term.toLowerCase()) ?? 1), 0)
    + matchedSnippetOnly.reduce((sum, term) => sum + (weights.get(term.toLowerCase()) ?? 1) * 0.55, 0);
  const coverage = totalWeight ? lexicalWeight / totalWeight : 0;

  const searchable = `${context.title} ${context.snippet ?? ''}`.toLowerCase();
  const shape = detectQueryShape(context.query);
  const intentMatch = shape === 'ranking' || shape === 'association'
    ? /\b(gwas|twas|association|associated|susceptibility|locus|loci|replication|meta-analysis)\b/.test(searchable)
    : shape === 'mechanism'
      ? /\b(mechanism|pathway|functional|regulat|signal|interaction)\w*/.test(searchable)
      : shape === 'comparison'
        ? /\b(compar|versus|differ|contrast)\w*/.test(searchable)
        : false;

  let score = 0.1 + coverage * 0.8 + Number(intentMatch) * 0.1;
  const matchedDistinctive = [...distinctive].filter((term) => titleWords.has(term) || snippetWords.has(term));
  if (distinctive.size > 0 && matchedDistinctive.length === 0) score = Math.min(score, 0.3);
  if (context.retrievalRelevance !== undefined) score = score * 0.8 + clamp01(context.retrievalRelevance) * 0.2;
  score = Math.round(clamp01(score) * 1000) / 1000;

  const matched = [...new Set([...matchedTitle, ...matchedSnippetOnly])].slice(0, 6);
  const reason = distinctive.size > 0 && matchedDistinctive.length === 0
    ? `No named genetic entity matched; relevance capped despite ${matched.length} broader term match(es).`
    : matched.length
      ? `Matched ${matched.join(', ')}${intentMatch ? ` plus ${shape}-evidence terminology` : ''}.`
      : 'No explicit query term matched the available title or snippet.';
  return { score, reason };
}

export function buildSourceScore(
  classification: Pick<SourceClassification, 'kind' | 'publicationYear' | 'declaresConflictsOfInterest' | 'hasExplicitMethods' | 'appliesTo'>,
  runSetting: string,
  relevanceContext: SourceRelevanceContext,
): ScoreBreakdown {
  const relevanceResult = computeDeterministicRelevance(relevanceContext);
  const relevance = relevanceResult.score;
  const level = LEVEL_WEIGHTS[classification.kind];
  const quality = computeQuality(classification);
  const currency = computeCurrency(classification.publicationYear, false);
  const applicabilityLabel = computeApplicability(classification.appliesTo?.setting, runSetting);
  const applicability = APPLICABILITY_WEIGHTS[applicabilityLabel];

  const total = computeSourceScore({
    relevance,
    quality,
    kind: classification.kind,
    year: classification.publicationYear,
    isSuperseded: false,
    applicability: applicabilityLabel,
  });

  return { relevance, relevanceReason: relevanceResult.reason, level, quality, currency, applicability, applicabilityLabel, total };
}
