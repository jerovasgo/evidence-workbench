import { describe, expect, it } from 'vitest';
import type { Claim } from '@/shared/domain';
import { pairClaimsForRelations } from './pair-claims';

function claim(overrides: Partial<Claim>): Claim {
  return {
    id: 'c',
    text: 'A polar aprotic solvent increases the SN2 reaction rate.',
    basis: 'primary',
    actionType: 'finding',
    conditions: [],
    subQuestionIndex: 0,
    sourceId: 's1',
    passageId: 'p1',
    quote: 'Aspirin.',
    grade: { certainty: 'ungraded', origin: 'ai_estimated' },
    verification: { exists: true, quoteFound: true, retracted: false, support: 'supports', retractionCheck: 'crossref_no_signal' },
    safetyCritical: false,
    ...overrides,
  };
}

describe('pairClaimsForRelations', () => {
  it('pairs two claims with the same actionType from different sources', () => {
    const a = claim({ id: 'a', sourceId: 's1' });
    const b = claim({ id: 'b', sourceId: 's2' });

    const pairs = pairClaimsForRelations([a, b]);

    expect(pairs).toHaveLength(1);
    expect(pairs[0]).toEqual({ a, b });
  });

  it('does not pair different or unassigned questions', () => {
    const a = claim({ sourceId: 's1' });
    expect(pairClaimsForRelations([a, claim({ sourceId: 's2', subQuestionIndex: 1 })])).toEqual([]);
    expect(pairClaimsForRelations([a, claim({ sourceId: 's2', subQuestionIndex: undefined })])).toEqual([]);
  });

  it('never pairs two claims from the same source', () => {
    const a = claim({ id: 'a', sourceId: 's1' });
    const b = claim({ id: 'b', sourceId: 's1' });

    expect(pairClaimsForRelations([a, b])).toEqual([]);
  });

  it('never pairs claims with different actionType', () => {
    const a = claim({ id: 'a', sourceId: 's1', actionType: 'finding' });
    const b = claim({ id: 'b', sourceId: 's2', actionType: 'method' });

    expect(pairClaimsForRelations([a, b])).toEqual([]);
  });

  it('never compares a claim without a completed retraction check', () => {
    const a = claim({ id: 'a', sourceId: 's1' });
    const b = claim({ id: 'b', sourceId: 's2', verification: { exists: true, quoteFound: true, retracted: false, support: 'supports' } });
    expect(pairClaimsForRelations([a, b])).toEqual([]);
  });

  it('pairs when either claim is unconditioned, even if the other has conditions', () => {
    const a = claim({ id: 'a', sourceId: 's1', conditions: [] });
    const b = claim({ id: 'b', sourceId: 's2', conditions: [{ variable: 'age', op: '>', value: 65 }] });

    expect(pairClaimsForRelations([a, b])).toHaveLength(1);
  });

  it('pairs when conditions share a variable, regardless of operator/value', () => {
    const a = claim({ id: 'a', sourceId: 's1', conditions: [{ variable: 'age', op: '>', value: 65 }] });
    const b = claim({ id: 'b', sourceId: 's2', conditions: [{ variable: 'age', op: '<', value: 18 }] });

    expect(pairClaimsForRelations([a, b])).toHaveLength(1);
  });

  it('retains claims with differently named conditions for review', () => {
    const a = claim({ id: 'a', sourceId: 's1', conditions: [{ variable: 'age', op: '>', value: 65 }] });
    const b = claim({ id: 'b', sourceId: 's2', conditions: [{ variable: 'egfr', op: '<', value: 30 }] });

    expect(pairClaimsForRelations([a, b])).toHaveLength(1);
  });

  it('caps the number of pairs to avoid cost/latency blowup on a large claim set', () => {
    const claims = Array.from({ length: 20 }, (_, i) => claim({ id: `c${i}`, sourceId: `s${i}` }));
    const pairs = pairClaimsForRelations(claims);
    expect(pairs.length).toBeLessThanOrEqual(60);
  });
});
