import { randomUUID } from 'node:crypto';
import type { Claim, Passage } from '@/shared/domain';
import { gradeClaim } from '@/modules/04-grading-scoring';
import { applyDoseRule, checkNumbersPreserved, findQuoteInPassage, normalizeForMatch } from '../validators/quote';
import { applySafetyCriticalRule } from '../validators/safety-critical';
import type { ExtractedClaim } from '../schemas/extraction';
import type { JudgeSupportOutput } from '../schemas/support-judge';

// Module 03 deterministic verification (docs/architecture/03-claim-extraction-and-verification.md):
// runs steps 2/3/5/6/7 against one already-extracted claim. Steps 1 ("exists") and 4
// ("not retracted") are source-level, not claim-level, and are checked once per
// source by the caller (`extract-and-verify-source.ts`) before this function runs at
// all — a source whose full text couldn't be fetched never reaches here, and a
// retracted source's claims are dropped by this function via `retracted: true`.
// Step 8 ("support") isn't decided here — every claim this function keeps carries
// `verification.support: 'unknown'` as a placeholder; the caller
// (`extract-and-verify-source.ts`) runs the `support-judge` agent (P10) afterward
// and calls `applySupportJudgment` (below) to fill in the real verdict. Splitting it
// this way keeps this function pure/sync (no model calls) and independently
// testable, while the async judging step composes on top.

export interface VerifyClaimInput {
  extracted: ExtractedClaim;
  sourceId: string;
  /** Precomputed once per source by the caller (`checkRetraction`). */
  retracted: boolean;
}

export type VerifyClaimResult = { outcome: 'kept'; claim: Claim } | { outcome: 'dropped'; reason: string };

/** Match an extractive context value as a complete phrase, never inside another gene or word. */
function contextAppearsInQuote(quote: string, value: string): boolean {
  const normalizedValue = normalizeForMatch(value);
  if (!normalizedValue) return false;
  const escaped = normalizedValue.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, 'u').test(normalizeForMatch(quote));
}

export function verifyClaim(input: VerifyClaimInput, passages: Passage[]): VerifyClaimResult {
  const { extracted } = input;

  const passage = passages.find((p) => p.id === extracted.passageId);
  if (!passage) {
    return { outcome: 'dropped', reason: `passageId "${extracted.passageId}" is not one of this source's passages (invalid locator)` };
  }

  const quoteMatch = findQuoteInPassage(passage.text, extracted.quote);
  if (!quoteMatch.found) {
    return { outcome: 'dropped', reason: 'quote not found verbatim in the cited passage' };
  }

  if (input.retracted) {
    return { outcome: 'dropped', reason: 'source is retracted or withdrawn' };
  }

  // Dose rule (CLAUDE.md rule 6) first: an unverified dose is softened to "per local
  // protocol" rather than dropping the whole claim. Any OTHER number that still
  // doesn't match after that drops the claim (architecture doc step 5: "drop the
  // number or the claim" — this module takes the stricter branch rather than
  // attempting fragile free-text surgery on a non-dose number).
  const doseCorrectedText = applyDoseRule(extracted.text, extracted.quote);
  const numbersCheck = checkNumbersPreserved(doseCorrectedText, extracted.quote);
  if (!numbersCheck.ok) {
    return { outcome: 'dropped', reason: `number(s) not present in quote: ${numbersCheck.missing.join(', ')}` };
  }

  // Context is extractive: never promote a model-proposed value absent from the quote.
  const geneticContext = extracted.geneticContext && Object.fromEntries(
    Object.entries(extracted.geneticContext).filter(([, value]) =>
      typeof value === 'string' && contextAppearsInQuote(extracted.quote, value),
    ),
  );

  const safetyCritical = applySafetyCriticalRule(extracted.safetyCritical, `${doseCorrectedText} ${extracted.quote}`);

  const claim: Claim = {
    id: randomUUID(),
    text: doseCorrectedText,
    basis: extracted.basis,
    actionType: extracted.actionType,
    conditions: extracted.conditions,
    geneticContext,
    subQuestionIndex: extracted.subQuestionIndex,
    sourceId: input.sourceId,
    passageId: extracted.passageId,
    quote: extracted.quote,
    // Module 04's deterministic grade-maps: a recognized printed grade (ACC/AHA,
    // GRADE, USPSTF, Oxford CEBM) is copied verbatim and mapped, origin:'source'; no
    // native grade, or an unrecognized scheme, falls back to an honest `ungraded`
    // (gradeClaim.ts). The AI-estimated half (grade-estimator, P6) isn't built yet.
    grade: gradeClaim(extracted.nativeGrade),
    verification: { exists: false, quoteFound: true, quoteMatch: quoteMatch.fuzzy ? 'ocr_fuzzy' : 'normalized_exact', retracted: false, support: 'unknown' },
    safetyCritical,
  };

  return { outcome: 'kept', claim };
}

/**
 * Applies a `support-judge` verdict to an already-deterministically-verified claim.
 * `'no'` means the judge found the quote does not actually support the claim — the
 * caller drops it (returns null), same as any other failed check. `'supports'` and
 * `'partial'` keep the claim with the real verdict and, if the judge gave any,
 * `supportIssues`/`supportNote` for a visible caveat (architecture doc: "partial ->
 * show with visible caveat"). `'unknown'` also keeps the claim — it's the honest
 * "couldn't determine" state, not a failure to drop over.
 */
export function applySupportJudgment(claim: Claim, judgment: JudgeSupportOutput): Claim | null {
  if (judgment.support === 'no') return null;

  // supportIssues/supportNote are the visible caveat for a less-than-full verdict
  // (architecture doc: "partial -> show with visible caveat"). A full 'supports'
  // has nothing to caveat, so its note/issues are dropped even if the judge wrote
  // one (the prompt asks for a one-sentence note on every verdict, not only the
  // ones worth surfacing).
  const isFullSupport = judgment.support === 'supports';

  return {
    ...claim,
    verification: {
      ...claim.verification,
      support: judgment.support,
      supportIssues: !isFullSupport && judgment.issues.length > 0 ? judgment.issues : undefined,
      supportNote: !isFullSupport && judgment.note.length > 0 ? judgment.note : undefined,
    },
  };
}
