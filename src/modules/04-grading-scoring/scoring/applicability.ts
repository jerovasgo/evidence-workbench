import type { Applicability } from '@/modules/02-retrieval';

// Module 04 source-score "applicability" factor (docs/architecture/04-grading-and-scoring.md:
// "1.0 matches setting/population; 0.8 partial; 0.6 mismatch"), narrowed here to
// SETTING only. The run's `population` and the source's own `appliesTo.population`
// are both free text, and reliably judging whether they match needs real semantic
// reading (the same kind of population-mismatch check `support-judge`, module 03,
// already makes per claim) — a simple code heuristic risks a false sense of
// precision there, so population intentionally isn't scored here. Logged as a known
// gap (SECURITY.md), not silently guessed.

const SETTING_KEYWORDS: Record<string, string[]> = {
  emergency: ['emergency', 'acute care', 'urgent care', ' ed ', ' er '],
  inpatient: ['inpatient', 'hospital', 'ward', 'admitted'],
  primary_care: ['primary care', 'outpatient', 'ambulatory', 'family medicine', 'general practice'],
  low_resource: ['low-resource', 'low resource', 'resource-limited', 'resource limited', 'rural', 'lmic'],
};

/**
 * Compares a source's free-text `appliesTo.setting` (module 02 classifier, P4)
 * against the run's own structured `setting` (module 01 `scenario-structurer`, one
 * of `SettingSchema`'s values, passed as a plain string to avoid module 04 depending
 * back on module 01's schema). `runSetting === 'unknown'` or no source setting text
 * at all -> 'partial' (nothing to compare, never guessed as a match or mismatch).
 * Source text naming the SAME setting -> 'match'; naming a clearly DIFFERENT known
 * setting -> 'mismatch'; unrecognized wording -> 'partial'.
 */
export function computeApplicability(sourceSetting: string | undefined, runSetting: string): Applicability {
  if (runSetting === 'unknown' || !runSetting || !sourceSetting) return 'partial';
  const ownKeywords = SETTING_KEYWORDS[runSetting];
  if (!ownKeywords) return 'partial';

  const normalized = ` ${sourceSetting.toLowerCase()} `;
  if (ownKeywords.some((kw) => normalized.includes(kw))) return 'match';

  const namesOtherSetting = Object.entries(SETTING_KEYWORDS).some(
    ([setting, keywords]) => setting !== runSetting && keywords.some((kw) => normalized.includes(kw)),
  );
  return namesOtherSetting ? 'mismatch' : 'partial';
}
