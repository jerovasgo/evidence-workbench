import { randomUUID } from 'node:crypto';
import type { Claim, Passage } from '@/shared/domain';
import { applyDoseRule, checkNumbersPreserved, findQuoteInPassage } from '../validators/quote';
import { applySafetyCriticalRule } from '../validators/safety-critical';
import type { ExtractedClaim } from '../schemas/extraction';

// Module 03 deterministic verification (docs/architecture/03-claim-extraction-and-verification.md):
// runs steps 2/3/5/6/7 against one already-extracted claim. Steps 1 ("exists") and 4
// ("not retracted") are source-level, not claim-level, and are checked once per
// source by the caller (`extract-and-verify-source.ts`) before this function runs at
// all — a source whose full text couldn't be fetched never reaches here, and a
// retracted source's claims are dropped by this function via `retracted: true`.
// Step 8 ("support") has no `support-judge` agent yet (not built) — every claim this
// function keeps carries `verification.support: 'unknown'`, which
// `shared/domain/claim.ts`'s `VerifiedClaimSchema` deliberately refuses to accept as
// `verified`; callers must not treat this module's output as display-ready on its own.

export interface VerifyClaimInput {
  extracted: ExtractedClaim;
  sourceId: string;
  /** Precomputed once per source by the caller (`checkRetraction`). */
  retracted: boolean;
}

export type VerifyClaimResult = { outcome: 'kept'; claim: Claim } | { outcome: 'dropped'; reason: string };

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

  const safetyCritical = applySafetyCriticalRule(extracted.safetyCritical, `${doseCorrectedText} ${extracted.quote}`);

  const claim: Claim = {
    id: randomUUID(),
    text: doseCorrectedText,
    basis: extracted.basis,
    actionType: extracted.actionType,
    conditions: extracted.conditions,
    sourceId: input.sourceId,
    passageId: extracted.passageId,
    quote: extracted.quote,
    // Module 04 (grading) isn't built yet; `certainty: 'ungraded'` is an honest
    // placeholder, not an invented grade — a future grading pass overwrites this.
    grade: { certainty: 'ungraded', origin: 'ai_estimated', nativeGrade: extracted.nativeGrade },
    verification: { exists: true, quoteFound: true, retracted: false, support: 'unknown' },
    safetyCritical,
  };

  return { outcome: 'kept', claim };
}
