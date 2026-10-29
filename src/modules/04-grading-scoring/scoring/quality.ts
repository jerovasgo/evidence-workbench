import type { SourceClassification } from '@/modules/02-retrieval';

// Module 04 source-score "quality" factor (docs/architecture/04-grading-and-scoring.md):
// "1.0 default; x0.8 for no COI statement; x0.7 for industry-only authorship; x0.85
// for not systematic search (guidelines)." The classifier (P4, module 02) has no
// field for industry-only authorship — nothing captures it — so that factor is never
// applied here; a known gap (SECURITY.md), not a silent omission.

export function computeQuality(
  classification: Pick<SourceClassification, 'kind' | 'declaresConflictsOfInterest' | 'hasExplicitMethods'>,
): number {
  let quality = 1.0;

  // P4's own rule: "use the field's absence when the text does not say; never guess."
  // Only an EXPLICIT false penalizes quality — an unknown/absent flag never does.
  if (classification.declaresConflictsOfInterest === false) quality *= 0.8;
  if (classification.kind === 'standards_body' && classification.hasExplicitMethods === false) quality *= 0.85;

  return quality;
}
