// 2026-11-02 (docs/DECISIONS.md): `algorithm-view.tsx`/`mechanism-view.tsx` used to
// interpolate the pipeline's internal abstain `reason` string directly into the UI —
// this is literally how "Insufficient unreserved budget" (a budget-guard internal
// detail, `src/shared/agents/run-agent.ts`) reached the user verbatim, reading as a
// dead end rather than a narrated limitation. A pure, deterministic rewrite (same
// shape as `result-summary.ts`'s template-built summary — never a model call, never
// fabricated content) so the reasons that are internal implementation detail get a
// clean sentence, while reasons that are already genuinely informative (a violation
// list, "no verified findings yet") pass through unchanged.

export function humanizeAbstainReason(reason: string, viewLabel: string): string {
  if (/insufficient unreserved budget/i.test(reason)) {
    return `This run's cost budget was used up before the ${viewLabel} could be generated — the verified findings below are still complete and accurate.`;
  }
  if (/timed out/i.test(reason)) {
    return `Generating the ${viewLabel} took too long and was stopped. Try the question again, or review the verified findings below in the meantime.`;
  }
  if (/no verified findings are available/i.test(reason) || /did not meet structural requirements/i.test(reason)) {
    return reason;
  }
  // A schema-invalid or other internal detail — never leak a raw validation error.
  return `The ${viewLabel} could not be generated for this question. The verified findings below are still complete and accurate.`;
}
