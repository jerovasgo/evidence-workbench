import { expect, it } from 'vitest';
import type { Claim } from '@/shared/domain';
import { buildVerificationReport } from './verification-report';

it('records the actual verification gates for a source-grounded claim', () => {
  const claim: Claim = {
    text: 'HNF1A expression increased.', quote: 'HNF1A expression increased.', passageId: 'source:0', conditions: [],
    sourceId: 'source', basis: 'primary', actionType: 'finding', grade: { certainty: 'ungraded', origin: 'ai_estimated' }, safetyCritical: false,
    id: 'c1', verification: { exists: true, quoteFound: true, quoteMatch: 'normalized_exact', retracted: false, support: 'supports', retractionCheck: 'crossref_no_signal' },
  };
  const report = buildVerificationReport(claim);
  expect(report.final).toBe('verified');
  expect(report.claimId).toBe('c1');
  expect(report.checks).toHaveLength(6);
  expect(report.checks.every((check) => check.ok)).toBe(true);
});
