import type { Claim, VerificationReport } from '@/shared/domain';
import { checkNumbersPreserved } from '../validators/quote';

/** Audit of checks actually completed for a retained claim. */
export function buildVerificationReport(claim: Claim): VerificationReport {
  const v = claim.verification;
  const checks = [
    { name: 'source_exists', ok: v.exists },
    { name: 'quote_in_passage', ok: v.quoteFound, detail: v.quoteMatch },
    { name: 'locator_valid', ok: Boolean(claim.passageId) },
    { name: 'numbers_preserved', ok: checkNumbersPreserved(claim.text, claim.quote).ok && claim.conditions.every((condition) => checkNumbersPreserved(`${condition.value}${condition.unit ? ` ${condition.unit}` : ''}`, claim.quote).ok) },
    { name: 'not_retracted', ok: !v.retracted, detail: v.retractionCheck },
    { name: 'source_support', ok: v.support === 'supports', detail: v.supportNote ?? v.support },
  ];
  return {
    claimId: claim.id,
    checks,
    final: checks.every((check) => check.ok) ? 'verified' : v.support === 'partial' && checks.slice(0, -1).every((check) => check.ok) ? 'partial' : 'unknown',
  };
}
