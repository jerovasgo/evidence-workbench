// Module 03 step 7: "Safety-critical raise: a rule list (anticoagulation,
// thrombolysis, insulin, opioids, pediatric dosing, contraindication language, 'do
// not') can set safetyCritical=true regardless of the model." Code can only RAISE
// this flag, never lower a safetyCritical=true the model already set.

const SAFETY_CRITICAL_PATTERNS: RegExp[] = [
  /anticoagul/i,
  /thromboly/i,
  /\binsulin\b/i,
  /\bopioid/i,
  /pediatric dos/i,
  /\bcontraindicat/i,
  /\bdo not\b/i,
];

export function detectSafetyCritical(text: string): boolean {
  return SAFETY_CRITICAL_PATTERNS.some((pattern) => pattern.test(text));
}

/** Applies the code-side rule on top of whatever the model already proposed. */
export function applySafetyCriticalRule(modelProposed: boolean, text: string): boolean {
  return modelProposed || detectSafetyCritical(text);
}
