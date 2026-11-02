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

  it('keeps a partially supported claim with its caveat after provisional review', () => {
    let state = applyEvent(initialState(), { type: 'provisional_claims_ready', runId: 'r1', sourceId: 's1', claims: [provisional] });
    const qualified: Claim = { ...provisional, verification: { ...provisional.verification, exists: true, support: 'partial', supportNote: 'Limited to one cell model.', retractionCheck: 'crossref_no_signal' } };
    state = applyEvent(state, { type: 'qualified_claims_ready', runId: 'r1', sourceId: 's1', claims: [qualified] });
    state = applyEvent(state, { type: 'source_reviewed', runId: 'r1', sourceId: 's1', acceptedClaimIds: ['c1'], withdrawnCount: 0 });
    expect(state.provisionalBySource.s1).toBeUndefined();
    expect(state.qualifiedBySource.s1).toEqual([qualified]);
    expect(state.withdrawals).toEqual([]);
  });
});

describe('opening_ready provisional-to-final upgrade (docs/DECISIONS.md, 2026-11-02)', () => {
  it('shows the provisional overview immediately, not final', () => {
    const state = applyEvent(initialState(), { type: 'opening_ready', runId: 'r1', text: 'Initial abstracts-only overview', final: false });
    expect(state.opening).toBe('Initial abstracts-only overview');
    expect(state.openingFinal).toBe(false);
  });

  it('upgrades the provisional overview exactly once when the final, claims-grounded one arrives', () => {
    let state = applyEvent(initialState(), { type: 'opening_ready', runId: 'r1', text: 'Initial abstracts-only overview', final: false });
    state = applyEvent(state, { type: 'opening_ready', runId: 'r1', text: 'Final grounded overview', final: true });
    expect(state.opening).toBe('Final grounded overview');
    expect(state.openingFinal).toBe(true);
  });

  it('never rewrites the overview again once the final one has been shown', () => {
    let state = applyEvent(initialState(), { type: 'opening_ready', runId: 'r1', text: 'Initial abstracts-only overview', final: false });
    state = applyEvent(state, { type: 'opening_ready', runId: 'r1', text: 'Final grounded overview', final: true });
    state = applyEvent(state, { type: 'opening_ready', runId: 'r1', text: 'Some later stray event', final: false });
    expect(state.opening).toBe('Final grounded overview');
  });
});

describe('algorithm_ready', () => {
  const graph = {
    nodes: [{ id: 'n1', type: 'action' as const, label: 'Check guide length', claimIds: ['c1'], provenance: 'external' as const }],
    edges: [],
  };

  it('stores the graph and band on an ok result', () => {
    const state = applyEvent(initialState(), { type: 'algorithm_ready', runId: 'r1', payload: { status: 'ok', graph, band: { criticalChecks: [], firstAction: 'n1' } } });
    expect(state.algorithmStatus).toBe('ok');
    expect(state.algorithm).toEqual({ graph, band: { criticalChecks: [], firstAction: 'n1' } });
    expect(state.algorithmAbstainReason).toBeNull();
  });

  it('keeps no graph and records the reason on an abstained result', () => {
    const state = applyEvent(initialState(), { type: 'algorithm_ready', runId: 'r1', payload: { status: 'abstained', reason: 'Not enough verified claims.' } });
    expect(state.algorithmStatus).toBe('abstained');
    expect(state.algorithm).toBeNull();
    expect(state.algorithmAbstainReason).toBe('Not enough verified claims.');
  });
});

describe('mechanism_ready', () => {
  const graph = {
    scope: 'CRISPR-Cas9 cleavage',
    entities: [
      { id: 'e1', label: 'Cas9', kind: 'enzyme' as const },
      { id: 'e2', label: 'Target DNA', kind: 'product' as const },
    ],
    interactions: [
      { id: 'i1', from: 'e1', to: 'e2', type: 'degrades' as const, sign: '+' as const, order: 0, claimId: 'c1' },
    ],
  };

  it('stores the graph on an ok result', () => {
    const state = applyEvent(initialState(), { type: 'mechanism_ready', runId: 'r1', payload: { status: 'ok', graph } });
    expect(state.mechanismStatus).toBe('ok');
    expect(state.mechanism).toEqual({ graph });
    expect(state.mechanismAbstainReason).toBeNull();
  });

  it('keeps no graph and records the reason on an abstained result', () => {
    const state = applyEvent(initialState(), { type: 'mechanism_ready', runId: 'r1', payload: { status: 'abstained', reason: 'Not enough verified claims.' } });
    expect(state.mechanismStatus).toBe('abstained');
    expect(state.mechanism).toBeNull();
    expect(state.mechanismAbstainReason).toBe('Not enough verified claims.');
  });
});
