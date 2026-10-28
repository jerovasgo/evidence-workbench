import type { Grade } from '@/shared/domain';

// Module 04 (docs/architecture/04-grading-and-scoring.md): "UI label strings
// centralised (src/lib/i18n/grade-labels.ts): 'From source: ACC/AHA Class I, LOE B-R'
// vs 'AI-estimated (GRADE-style, 3 of 5 domains judged)'." The AI-estimated/domains
// half isn't reachable yet (no grade-estimator agent built) — `gradeOriginLabel`
// returns the plain "AI-estimated" CLAUDE.md rule 7 already requires until it is.

const CERTAINTY_LABEL: Record<Grade['certainty'], string> = {
  high: 'High',
  moderate: 'Moderate',
  low: 'Low',
  very_low: 'Very low',
  ungraded: 'Ungraded',
};

function strengthLabel(strength: NonNullable<Grade['strength']>): string {
  const direction = strength.direction === 'for' ? 'For' : 'Against';
  const level = strength.level === 'strong' ? 'strong' : 'conditional';
  return `${direction}, ${level}`;
}

/** "High" or "High · For, strong" — certainty alone, plus strength when the source printed one. */
export function gradeSummaryLabel(grade: Grade): string {
  const parts = [CERTAINTY_LABEL[grade.certainty]];
  if (grade.strength) parts.push(strengthLabel(grade.strength));
  return parts.join(' · ');
}

/** "From source: Class I, LOE A" (verbatim nativeGrade) or the plain "AI-estimated"/"From source" badge text. */
export function gradeOriginLabel(grade: Grade): string {
  if (grade.origin === 'source') {
    return grade.nativeGrade ? `From source: ${grade.nativeGrade}` : 'From source';
  }
  return 'AI-estimated';
}
