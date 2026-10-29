import type { Applicability } from '@/modules/02-retrieval';

// Module 04 source-score "applicability" factor (docs/architecture/04-grading-and-scoring.md:
// "1.0 matches setting/population; 0.8 partial; 0.6 mismatch"), narrowed here to
// CONTEXT only (2026-10-29 pivot: clinical "setting" -> general-science "context" —
// in_vitro/in_vivo/in_silico/theoretical/field_study/industrial_or_applied). The run's
// `scope` and the source's own `appliesTo.scope` are both free text, and reliably
// judging whether they match needs real semantic reading (the same kind of
// scope-mismatch check `support-judge`, module 03, already makes per claim) — a
// simple code heuristic risks a false sense of precision there, so scope
// intentionally isn't scored here. Logged as a known gap (SECURITY.md), not
// silently guessed.

const CONTEXT_KEYWORDS: Record<string, string[]> = {
  in_vitro: ['in vitro', 'cell culture', 'cell line', 'test tube', 'bench-scale', 'bench scale'],
  in_vivo: ['in vivo', 'animal model', 'organism', 'live subject', 'field trial'],
  in_silico: ['in silico', 'computational', 'simulation', 'computed', 'molecular dynamics'],
  theoretical: ['theoretical', 'derivation', 'proof', 'model prediction', 'analytic'],
  field_study: ['field study', 'field observation', 'ecological survey', 'observational field'],
  industrial_or_applied: ['industrial', 'pilot plant', 'applied', 'manufacturing', 'production scale'],
};

/**
 * Compares a source's free-text `appliesTo.setting` (module 02 classifier, P4,
 * still named `setting` there — it's the classifier's own free-text field, not an
 * enum) against the run's own structured `context` (module 01
 * `scenario-structurer`, one of `ContextSchema`'s values, passed as a plain string
 * to avoid module 04 depending back on module 01's schema). `runContext ===
 * 'unknown'` or no source text at all -> 'partial' (nothing to compare, never
 * guessed as a match or mismatch). Source text naming the SAME context -> 'match';
 * naming a clearly DIFFERENT known context -> 'mismatch'; unrecognized wording ->
 * 'partial'.
 */
export function computeApplicability(sourceSetting: string | undefined, runContext: string): Applicability {
  if (runContext === 'unknown' || !runContext || !sourceSetting) return 'partial';
  const ownKeywords = CONTEXT_KEYWORDS[runContext];
  if (!ownKeywords) return 'partial';

  const normalized = ` ${sourceSetting.toLowerCase()} `;
  if (ownKeywords.some((kw) => normalized.includes(kw))) return 'match';

  const namesOtherContext = Object.entries(CONTEXT_KEYWORDS).some(
    ([context, keywords]) => context !== runContext && keywords.some((kw) => normalized.includes(kw)),
  );
  return namesOtherContext ? 'mismatch' : 'partial';
}
