import { APPLICABILITY_WEIGHTS, computeCurrency, computeSourceScore, LEVEL_WEIGHTS, type SourceClassification } from '@/modules/02-retrieval';
import type { ScoreBreakdown } from '../schemas/score-breakdown';
import { computeApplicability } from './applicability';
import { computeQuality } from './quality';

// Module 04 source-score: assembles the full 5-factor breakdown the UI shows ("why
// ranked here"), reusing module 02's already-built level/currency math
// (`computeSourceScore`, `computeCurrency`, `LEVEL_WEIGHTS`) rather than re-deriving
// it, so `total` always stays consistent with that function's own formula.
//
// `relevance` has no computed source yet: the classifier (P4) isn't given the run's
// sub-questions to judge relevance against (SECURITY.md known gap) — so it's a fixed
// 1.0 placeholder here, not a real score, and is documented as such rather than
// silently presented as one.
//
// `isSuperseded` is always `false`: `SourceClassification.supersedesOrSupersededBy`
// is one ambiguous free-text field that doesn't say which DIRECTION the relationship
// runs (this source superseding an older one vs. being superseded by a newer one) —
// treating any non-empty value as "this source is outdated" would be a guess, so
// currency never penalizes it here. A known gap (SECURITY.md): the classifier schema
// needs two separate, unambiguous fields before this factor can be scored for real.
const DEFAULT_RELEVANCE = 1.0;

export function buildSourceScore(
  classification: Pick<SourceClassification, 'kind' | 'publicationYear' | 'declaresConflictsOfInterest' | 'hasExplicitMethods' | 'appliesTo'>,
  runSetting: string,
): ScoreBreakdown {
  const relevance = DEFAULT_RELEVANCE;
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

  return { relevance, level, quality, currency, applicability, applicabilityLabel, total };
}
