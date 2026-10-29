// Module 03 step 7: "Safety-critical raise: a rule list can set safetyCritical=true
// regardless of the model." Code can only RAISE this flag, never lower a
// safetyCritical=true the model already set. 2026-10-29 pivot (docs/DECISIONS.md):
// the keyword list moves from clinical/pharmacological hazard language to general
// lab/chemical/biological/physical hazard language — the underlying concept (a
// claim that, acted on wrongly, could cause real harm) generalizes cleanly from
// medicine to chemistry (reactive/toxic/explosive handling), biology (biohazard/
// pathogen handling) and physics (radiation/high-energy hazards).

const SAFETY_CRITICAL_PATTERNS: RegExp[] = [
  /\bexplosive/i,
  /\btoxic/i,
  /\bcorrosive/i,
  /\bflammable/i,
  /\bcarcinogen/i,
  /\bmutagen/i,
  /\bradioactive/i,
  /\bbiohazard/i,
  /\bpathogenic/i,
  /\binfectious/i,
  /\blethal\b/i,
  /\bfatal\b/i,
  /\bdo not mix\b/i,
];

export function detectSafetyCritical(text: string): boolean {
  return SAFETY_CRITICAL_PATTERNS.some((pattern) => pattern.test(text));
}

/** Applies the code-side rule on top of whatever the model already proposed. */
export function applySafetyCriticalRule(modelProposed: boolean, text: string): boolean {
  return modelProposed || detectSafetyCritical(text);
}
