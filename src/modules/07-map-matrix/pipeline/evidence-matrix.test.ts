import { describe, expect, it } from 'vitest';
import type { Claim } from '@/shared/domain';
import { buildEvidenceMatrix } from './evidence-matrix';

const claim: Claim = {
  id: 'a', text: 'Finding', basis: 'primary', actionType: 'finding', conditions: [],
  sourceId: 's1', passageId: 'p1', quote: 'Finding',
  grade: { certainty: 'ungraded', origin: 'ai_estimated' }, safetyCritical: false,
  verification: { exists: true, quoteFound: true, retracted: false, support: 'supports', retractionCheck: 'crossref_no_signal' },
};

describe('buildEvidenceMatrix', () => {
  it('groups multiple findings by source without inventing relationships', () => {
    const result = buildEvidenceMatrix([claim, { ...claim, id: 'b' }, { ...claim, id: 'c', sourceId: 's2' }]);
    expect(result.map((source) => [source.sourceId, source.claims.length])).toEqual([['s1', 2], ['s2', 1]]);
  });
  it('excludes unsupported, retracted and legacy claims without a recorded retraction check', () => {
    expect(buildEvidenceMatrix([
      { ...claim, verification: { ...claim.verification, support: 'unknown' } },
      { ...claim, verification: { ...claim.verification, retracted: true } },
      { ...claim, verification: { ...claim.verification, retractionCheck: undefined } },
    ])).toEqual([]);
  });
});
