import { describe, expect, it } from 'vitest';
import type { AlgorithmGraph } from '../schemas/algorithm';
import { findStartNodeId, flattenAlgorithmGraph } from './flatten-algorithm';

function node(overrides: Partial<AlgorithmGraph['nodes'][number]> & { id: string; type: AlgorithmGraph['nodes'][number]['type'] }) {
  return { label: overrides.id, claimIds: [], provenance: 'external' as const, ...overrides };
}

describe('flattenAlgorithmGraph', () => {
  it('walks a linear path in order, depth 0 for the start node', () => {
    const graph: AlgorithmGraph = {
      nodes: [node({ id: 'n1', type: 'assess' }), node({ id: 'n2', type: 'action', claimIds: ['c1'] }), node({ id: 'n3', type: 'outcome' })],
      edges: [
        { from: 'n1', to: 'n2', condition: { variable: 'x', op: '=', value: 1 } },
        { from: 'n2', to: 'n3', condition: { variable: 'y', op: '=', value: 1 } },
      ],
    };
    const flat = flattenAlgorithmGraph(graph, 'n1');
    expect(flat.map((e) => [e.node.id, e.depth])).toEqual([['n1', 0], ['n2', 1], ['n3', 2]]);
    expect(flat[0]?.edgeLabel).toBeUndefined();
    expect(flat[1]?.edgeLabel).toBe('x = 1');
  });

  it('branches a decision node into sibling children at the same depth, each with its own edge label', () => {
    const graph: AlgorithmGraph = {
      nodes: [
        node({ id: 'n1', type: 'decision' }),
        node({ id: 'n2', type: 'outcome' }),
        node({ id: 'n3', type: 'outcome' }),
      ],
      edges: [
        { from: 'n1', to: 'n2', condition: { variable: 'length', op: '>', value: 20, unit: 'nt' } },
        { from: 'n1', to: 'n3', condition: { variable: 'length', op: '<', value: 20, unit: 'nt' } },
      ],
    };
    const flat = flattenAlgorithmGraph(graph, 'n1');
    expect(flat.map((e) => [e.node.id, e.depth])).toEqual([['n1', 0], ['n2', 1], ['n3', 1]]);
    expect(flat[1]?.edgeLabel).toBe('length > 20 nt');
    expect(flat[2]?.edgeLabel).toBe('length < 20 nt');
  });

  it('renders an iterate back-edge target as a back-reference instead of recursing infinitely', () => {
    const graph: AlgorithmGraph = {
      nodes: [
        node({ id: 'n1', type: 'action', claimIds: ['c1'] }),
        node({ id: 'n2', type: 'iterate' }),
        node({ id: 'n3', type: 'outcome' }),
      ],
      edges: [
        { from: 'n1', to: 'n2', condition: { variable: 'x', op: '=', value: 1 } },
        { from: 'n2', to: 'n1', condition: { variable: 'x', op: '=', value: 0 } },
        { from: 'n2', to: 'n3', condition: { variable: 'x', op: '=', value: 1 } },
      ],
    };
    const flat = flattenAlgorithmGraph(graph, 'n1');
    expect(flat).toHaveLength(4);
    expect(flat.map((e) => e.node.id)).toEqual(['n1', 'n2', 'n1', 'n3']);
    expect(flat[2]?.isBackReference).toBe(true);
    expect(flat[0]?.isBackReference).toBeUndefined();
  });

  it('returns an empty list for an unknown start id', () => {
    const graph: AlgorithmGraph = { nodes: [node({ id: 'n1', type: 'outcome' })], edges: [] };
    expect(flattenAlgorithmGraph(graph, 'missing')).toEqual([]);
  });

  it('skips an edge pointing to a node id that does not exist in the graph', () => {
    const graph: AlgorithmGraph = {
      nodes: [node({ id: 'n1', type: 'action', claimIds: ['c1'] })],
      edges: [{ from: 'n1', to: 'ghost', condition: { variable: 'x', op: '=', value: 1 } }],
    };
    expect(flattenAlgorithmGraph(graph, 'n1').map((e) => e.node.id)).toEqual(['n1']);
  });
});

describe('findStartNodeId', () => {
  it('returns the node with no incoming edges', () => {
    const graph: AlgorithmGraph = {
      nodes: [node({ id: 'n1', type: 'assess' }), node({ id: 'n2', type: 'outcome' })],
      edges: [{ from: 'n1', to: 'n2', condition: { variable: 'x', op: '=', value: 1 } }],
    };
    expect(findStartNodeId(graph)).toBe('n1');
  });

  it('returns null for a graph with no nodes', () => {
    expect(findStartNodeId({ nodes: [], edges: [] })).toBeNull();
  });
});
