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

describe('agent_activity telemetry', () => {
  it('updates one real Meta call from running to completed without duplicating it', () => {
    let state = applyEvent(initialState(), { type: 'agent_activity', runId: 'r1', callId: 'call-1', name: 'claim-extractor', provider: 'Meta Model API', model: 'muse-spark-1.3', tier: 'T1', status: 'running', attempt: 1 });
    state = applyEvent(state, { type: 'agent_activity', runId: 'r1', callId: 'call-1', name: 'claim-extractor', provider: 'Meta Model API', model: 'muse-spark-1.3', tier: 'T1', status: 'completed', ms: 2400, tokens: 812, costUsd: 0.004 });

    expect(state.agentActivities).toEqual([{ callId: 'call-1', name: 'claim-extractor', provider: 'Meta Model API', model: 'muse-spark-1.3', tier: 'T1', status: 'completed', attempt: 1, ms: 2400, tokens: 812, costUsd: 0.004, reason: undefined }]);
  });
});

describe('opening_ready immutable publication', () => {
  it('retains provisional synthesis separately for an explicitly labelled early overview', () => {
    const state = applyEvent(initialState(), { type: 'opening_ready', runId: 'r1', text: 'Initial abstracts-only overview', final: false });
    expect(state.opening).toBeNull();
    expect(state.provisionalOpening).toBe('Initial abstracts-only overview');
    expect(state.openingFinal).toBe(false);
  });

  it('publishes the claims-grounded overview exactly once', () => {
    let state = applyEvent(initialState(), { type: 'opening_ready', runId: 'r1', text: 'Initial abstracts-only overview', final: false });
    state = applyEvent(state, { type: 'opening_ready', runId: 'r1', text: 'Final grounded overview', final: true });
    expect(state.opening).toBe('Final grounded overview');
    expect(state.openingFinal).toBe(true);
  });

  it('never rewrites the overview again once the final one has been shown', () => {
    let state = applyEvent(initialState(), { type: 'opening_ready', runId: 'r1', text: 'Initial abstracts-only overview', final: false });
    state = applyEvent(state, { type: 'opening_ready', runId: 'r1', text: 'Final grounded overview', final: true });
    state = applyEvent(state, { type: 'opening_ready', runId: 'r1', text: 'Some later stray event', final: false });
    state = applyEvent(state, { type: 'opening_ready', runId: 'r1', text: 'Duplicate final', final: true });
    expect(state.opening).toBe('Final grounded overview');
  });

  it('ignores a late provisional event when final content wins the race', () => {
    let state = applyEvent(initialState(), { type: 'opening_ready', runId: 'r1', text: 'Final grounded overview', final: true });
    state = applyEvent(state, { type: 'opening_ready', runId: 'r1', text: 'Late abstract synthesis', final: false });
    expect(state.opening).toBe('Final grounded overview');
    expect(state.provisionalOpening).toBeNull();
  });
});

describe('gene_context_ready enrichment', () => {
  it('merges later response entities without duplicating an existing gene', () => {
    let state = applyEvent(initialState(), { type: 'gene_context_ready', runId: 'r1', genes: [{ symbol: 'HNF1A', kind: 'gene', links: [{ label: 'NCBI Gene', url: 'https://www.ncbi.nlm.nih.gov/gene/6927' }] }] });
    state = applyEvent(state, { type: 'gene_context_ready', runId: 'r1', genes: [
      { symbol: 'HNF1A', kind: 'gene', name: 'HNF1 homeobox A', links: [{ label: 'NCBI Gene', url: 'https://www.ncbi.nlm.nih.gov/gene/6927' }] },
      { symbol: 'TP53', kind: 'gene', links: [{ label: 'NCBI Gene', url: 'https://www.ncbi.nlm.nih.gov/gene/7157' }] },
    ] });
    expect(state.geneContext.map((entity) => entity.symbol)).toEqual(['HNF1A', 'TP53']);
    expect(state.geneContext[0]?.name).toBe('HNF1 homeobox A');
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
