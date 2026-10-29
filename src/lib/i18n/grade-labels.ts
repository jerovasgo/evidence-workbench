import type { Grade } from '@/shared/domain';

// 2026-10-28 "no AI-inferred grades" policy (docs/DECISIONS.md, cancels the
// grade-estimator (P6) agent that was planned for module 04): a claim's certainty is
// shown only when it traces to an explicit, recognized grade printed by the source
// (`origin: 'source'` AND `certainty !== 'ungraded'`). Every other case — no printed
// grade at all, or text the known certainty language (grade-maps.ts) didn't recognize —
// renders as the neutral "Not graded" tag, never a number or category the system
// itself produced. `origin: 'ai_estimated'` no longer means "the AI estimated a
// grade" (nothing ever will); it only means "no formal grade was found."
//
// 2026-10-29 pivot: `Grade.strength` (clinical recommendation strength) is dropped
// — no general-science analog — so only `certainty` is labeled here now.

export const NOT_GRADED_TOOLTIP = 'No formal evidence grade was identified in the source.';

const CERTAINTY_LABEL: Record<Grade['certainty'], string> = {
  high: 'High',
  moderate: 'Moderate',
  low: 'Low',
  very_low: 'Very low',
  ungraded: 'Not graded',
};

/** "High" or "Not graded" — certainty alone, never combined with strength. */
export function gradeCertaintyLabel(grade: Grade): string {
  return CERTAINTY_LABEL[grade.certainty];
}

/**
 * Traceability line for the evidence drawer, or `undefined` when there is nothing to
 * attribute (no native grade text was ever found). A recognized grade reads
 * "From source: Class I, LOE A"; text that was found but didn't map to a known scheme
 * still shows — "Not graded" is about this project's own certainty scale, not a
 * claim that the source said nothing (CLAUDE.md rule 10's traceability requirement).
 */
export function gradeProvenanceLabel(grade: Grade): string | undefined {
  if (grade.origin !== 'source' || !grade.nativeGrade) return undefined;
  return grade.certainty === 'ungraded'
    ? `Source printed a grade in an unrecognized scheme: "${grade.nativeGrade}"`
    : `From source: ${grade.nativeGrade}`;
}
