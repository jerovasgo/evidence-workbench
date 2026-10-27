import type { SourceClassification } from '../schemas/classification';

// Module 02: "Code overrides the model when metadata is decisive (PubMed publication
// types: 'Practice Guideline', 'Systematic Review', 'Randomized Controlled Trial')."
// "Model proposes, code verifies" applied to classification specifically — this is
// the only thing allowed to change `kind` after the model has proposed one.

const DECISIVE_PUBMED_TYPES: { match: string; kind: SourceClassification['kind'] }[] = [
  { match: 'practice guideline', kind: 'guideline' },
  { match: 'systematic review', kind: 'systematic_review' },
  { match: 'meta-analysis', kind: 'systematic_review' },
  { match: 'randomized controlled trial', kind: 'rct' },
];

/**
 * Returns a copy of `classification` with `kind` forced to match a decisive PubMed
 * publication type, if one is present in `pubTypes` — model-proposed `kind` for any
 * other case is left untouched. The first matching rule in `DECISIVE_PUBMED_TYPES`
 * wins when a source carries more than one decisive type.
 */
export function applyPubmedTypeOverride(
  classification: SourceClassification,
  pubTypes: readonly string[],
): SourceClassification {
  const normalizedTypes = pubTypes.map((t) => t.toLowerCase());
  const decisive = DECISIVE_PUBMED_TYPES.find((rule) => normalizedTypes.includes(rule.match));
  if (!decisive || classification.kind === decisive.kind) return classification;
  return { ...classification, kind: decisive.kind };
}
