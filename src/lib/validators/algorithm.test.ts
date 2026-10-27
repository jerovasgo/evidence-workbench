import { describe, expect, it } from 'vitest';
import type { AlgorithmGraph } from '../schemas/algorithm.js';
import { deriveProvenance, validateAlgorithmGraph } from './algorithm.js';

function node(overrides: Partial<AlgorithmGraph['nodes'][number]> & { id: string; type: AlgorithmGraph['nodes'][number]['type'] }) {
  return {
    label: overrides.id,
    claimIds: [],
    provenance: 'external' as const,
    ...overrides,
  };
}

describe('validateAlgorithmGraph', () => {
  const verifiedClaimIds = new Set(['claim_1', 'claim_2']);

  it('passes a well-formed red-flag -> action -> disposition graph', () => {
    const graph: AlgorithmGraph = {
      nodes: [
        node({ id: 'n1', type: 'red_flag' }),
        node({ id: 'n2', type: 'action', claimIds: ['claim_1'] }),
        node({ id: 'n3', type: 'disposition' }),
      ],
      edges: [
        { from: 'n1', to: 'n2', condition: { variable: 'sbp', op: '<', value: 90 } },
        { from: 'n2', to: 'n3', condition: { variable: 'given', op: '=', value: 1 } },
      ],
    };
    expect(validateAlgorithmGraph(graph, verifiedClaimIds)).toEqual({ ok: true, violations: [] });
  });

  it('flags a cycle that is not a reassess back-edge', () => {
    const graph: AlgorithmGraph = {
      nodes: [node({ id: 'n1', type: 'action', claimIds: ['claim_1'] }), node({ id: 'n2', type: 'disposition' })],
      edges: [
        { from: 'n1', to: 'n2', condition: { variable: 'x', op: '=', value: 1 } },
        { from: 'n2', to: 'n1', condition: { variable: 'x', op: '=', value: 0 } },
      ],
    };
    const result = validateAlgorithmGraph(graph, verifiedClaimIds);
    expect(result.ok).toBe(false);
    expect(result.violations.some((v) => v.kind === 'cycle')).toBe(true);
  });

  it('allows a bounded back-edge through an explicit reassess node', () => {
    const graph: AlgorithmGraph = {
      nodes: [
        node({ id: 'n1', type: 'action', claimIds: ['claim_1'] }),
        node({ id: 'n2', type: 'reassess' }),
        node({ id: 'n3', type: 'disposition' }),
      ],
      edges: [
        { from: 'n1', to: 'n2', condition: { variable: 'x', op: '=', value: 1 } },
        { from: 'n2', to: 'n1', condition: { variable: 'x', op: '=', value: 0 } }, // reassess back-edge
        { from: 'n2', to: 'n3', condition: { variable: 'x', op: '=', value: 1 } },
      ],
    };
    const result = validateAlgorithmGraph(graph, verifiedClaimIds);
    expect(result.violations.some((v) => v.kind === 'cycle')).toBe(false);
  });

  it('flags multiple start nodes (more than one node with no incoming edge)', () => {
    const graph: AlgorithmGraph = {
      nodes: [node({ id: 'n1', type: 'red_flag' }), node({ id: 'n2', type: 'disposition' }), node({ id: 'n3', type: 'disposition' })],
      edges: [{ from: 'n1', to: 'n2', condition: { variable: 'x', op: '=', value: 1 } }],
    };
    const result = validateAlgorithmGraph(graph, verifiedClaimIds);
    expect(result.violations).toContainEqual({ kind: 'multiple_starts', nodeIds: ['n1', 'n3'] });
  });

  it('flags a red_flag node that is reachable only after a non-red-flag node', () => {
    const graph: AlgorithmGraph = {
      nodes: [node({ id: 'n1', type: 'assess' }), node({ id: 'n2', type: 'red_flag' }), node({ id: 'n3', type: 'disposition' })],
      edges: [
        { from: 'n1', to: 'n2', condition: { variable: 'x', op: '=', value: 1 } },
        { from: 'n2', to: 'n3', condition: { variable: 'x', op: '=', value: 1 } },
      ],
    };
    const result = validateAlgorithmGraph(graph, verifiedClaimIds);
    expect(result.violations).toContainEqual({ kind: 'red_flag_after_non_red_flag', edge: { from: 'n1', to: 'n2' } });
  });

  it('flags a leaf node that is neither disposition nor abstain', () => {
    const graph: AlgorithmGraph = {
      nodes: [node({ id: 'n1', type: 'red_flag' }), node({ id: 'n2', type: 'action', claimIds: ['claim_1'] })],
      edges: [{ from: 'n1', to: 'n2', condition: { variable: 'x', op: '=', value: 1 } }],
    };
    const result = validateAlgorithmGraph(graph, verifiedClaimIds);
    expect(result.violations).toContainEqual({ kind: 'leaf_not_terminal', nodeId: 'n2' });
  });

  it('flags an action node with no claims, and a test node citing an unknown claim', () => {
    const graph: AlgorithmGraph = {
      nodes: [
        node({ id: 'n1', type: 'action', claimIds: [] }),
        node({ id: 'n2', type: 'test', claimIds: ['claim_999'] }),
        node({ id: 'n3', type: 'disposition' }),
      ],
      edges: [
        { from: 'n1', to: 'n2', condition: { variable: 'x', op: '=', value: 1 } },
        { from: 'n2', to: 'n3', condition: { variable: 'x', op: '=', value: 1 } },
      ],
    };
    const result = validateAlgorithmGraph(graph, verifiedClaimIds);
    expect(result.violations).toContainEqual({ kind: 'action_node_missing_claim', nodeId: 'n1' });
    expect(result.violations).toContainEqual({ kind: 'claim_id_not_in_pool', nodeId: 'n2', claimId: 'claim_999' });
  });

  it('flags orphan nodes in a disconnected island that is itself a 2-cycle (so it adds no second start)', () => {
    // n3 <-> n4 each have an incoming edge (from each other), so neither looks like a
    // "start" by the no-incoming-edge rule — the graph still has exactly one declared
    // start (n1), yet n3/n4 are unreachable from it.
    const graph: AlgorithmGraph = {
      nodes: [
        node({ id: 'n1', type: 'red_flag' }),
        node({ id: 'n2', type: 'disposition' }),
        node({ id: 'n3', type: 'disposition' }),
        node({ id: 'n4', type: 'disposition' }),
      ],
      edges: [
        { from: 'n1', to: 'n2', condition: { variable: 'x', op: '=', value: 1 } },
        { from: 'n3', to: 'n4', condition: { variable: 'x', op: '=', value: 1 } },
        { from: 'n4', to: 'n3', condition: { variable: 'x', op: '=', value: 1 } },
      ],
    };
    const result = validateAlgorithmGraph(graph, verifiedClaimIds);
    expect(result.violations.some((v) => v.kind === 'multiple_starts')).toBe(false);
    expect(result.violations).toContainEqual({ kind: 'orphan_node', nodeId: 'n3' });
    expect(result.violations).toContainEqual({ kind: 'orphan_node', nodeId: 'n4' });
  });

  it('flags a graph over the 35-node readability cap', () => {
    const nodes = Array.from({ length: 36 }, (_, i) => node({ id: `n${i}`, type: i === 0 ? 'red_flag' : 'disposition' }));
    const graph: AlgorithmGraph = { nodes, edges: [] };
    const result = validateAlgorithmGraph(graph, verifiedClaimIds);
    expect(result.violations).toContainEqual({ kind: 'node_cap_exceeded', count: 36, cap: 35 });
  });
});

describe('deriveProvenance', () => {
  it('returns conflict regardless of source mix when claims contradict', () => {
    expect(deriveProvenance([{ isLocal: true }], true)).toBe('conflict');
  });

  it('returns local when all cited claims come from the local protocol', () => {
    expect(deriveProvenance([{ isLocal: true }, { isLocal: true }], false)).toBe('local');
  });

  it('returns external when all cited claims come from external sources', () => {
    expect(deriveProvenance([{ isLocal: false }], false)).toBe('external');
  });

  it('returns both when claims mix local and external sources without contradiction', () => {
    expect(deriveProvenance([{ isLocal: true }, { isLocal: false }], false)).toBe('both');
  });
});
