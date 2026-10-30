import { describe, expect, it } from 'vitest';
import type { Claim } from '@/shared/domain';
import { applyEvent, initialState } from './use-run-stream';

const provisional: Claim = {
  id: 'c1', text: 'Cas9 altered the target sequence.', basis: 'primary', actionType: 'finding', conditions: [],
  sourceId: 's1', passageId: 'p1', quote: 'Cas9 altered the target sequence.',
  grade: { certainty: 'ungraded', origin: 'ai_estimated' }, safetyCritical: false,
  verification: { exists: false, quoteFound: true, quoteMatch: 'normalized_exact', retracted: false, support: 'unknown' },
};

describe('provisional SSE claim lifecycle', () => {
  it('withdraws only the reviewed source and retains a visible audit notice', () => {
    let state = applyEvent(initialState(), { type: 'provisional_claims_ready', runId: 'r1', sourceId: 's1', claims: [provisional] });
    state = applyEvent(state, { type: 'source_reviewed', runId: 'r1', sourceId: 's1', acceptedClaimIds: [], withdrawnCount: 1, reason: 'retraction status unknown' });
    expect(state.provisionalBySource.s1).toBeUndefined();
    expect(state.withdrawals).toEqual([{ sourceId: 's1', count: 1, reason: 'retraction status unknown' }]);
    expect(state.claims).toBeNull();
  });

  it('promotes the same claim id into verified results without a withdrawal notice', () => {
    let state = applyEvent(initialState(), { type: 'provisional_claims_ready', runId: 'r1', sourceId: 's1', claims: [provisional] });
    const verified = { ...provisional, verification: { ...provisional.verification, exists: true, support: 'supports' as const, retractionCheck: 'crossref_no_signal' as const } };
    state = applyEvent(state, { type: 'band_ready', runId: 'r1', payload: { claims: [verified] } });
    state = applyEvent(state, { type: 'source_reviewed', runId: 'r1', sourceId: 's1', acceptedClaimIds: ['c1'], withdrawnCount: 0 });
    expect(state.provisionalBySource.s1).toBeUndefined();
    expect(state.claims).toEqual([verified]);
    expect(state.withdrawals).toEqual([]);
  });
});
