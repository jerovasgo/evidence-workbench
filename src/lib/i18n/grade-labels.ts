import type { Grade } from '@/shared/domain';

// 2026-10-28 "no AI-inferred grades" policy (docs/DECISIONS.md, cancels the
// grade-estimator (P6) agent that was planned for module 04): a claim's certainty is
// shown only when it traces to an explicit, recognized grade printed by the source
// (`origin: 'source'` AND `certainty !== 'ungraded'`). Every other case — no printed
// grade at all, or text the four known schemes (grade-maps.ts) didn't recognize —
// renders as the neutral "Not graded" tag, never a number or category the system
// itself produced. `origin: 'ai_estimated'` no longer means "the AI estimated a
// grade" (nothing ever will); it only means "no formal grade was found."
//
// Certainty and strength are independent dimensions (SPEC §8 principle 3) and are
// labeled independently here: a source can print a strength (e.g. "Class I") with no
// usable certainty level (no LOE given) — that strength still shows while certainty
// reads "Not graded," never silently merged into one combined label.

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

/** "For, strong" / "Against, conditional" — strength alone, shown only when the source printed one. */
export function gradeStrengthLabel(strength: NonNullable<Grade['strength']>): string {
  const direction = strength.direction === 'for' ? 'For' : 'Against';
  const level = strength.level === 'strong' ? 'strong' : 'conditional';
  return `${direction}, ${level}`;
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
