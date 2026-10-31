import { describe, expect, it } from 'vitest';
import type { AlgorithmGraph } from '../schemas/algorithm';
import { layoutAlgorithmGraph, type AlgorithmFlowNode } from './layout-algorithm';

function node(overrides: Partial<AlgorithmGraph['nodes'][number]> & { id: string; type: AlgorithmGraph['nodes'][number]['type'] }) {
  return { label: overrides.id, claimIds: [], provenance: 'external' as const, ...overrides };
}

function overlaps(a: AlgorithmFlowNode, b: AlgorithmFlowNode): boolean {
  return a.position.x < b.position.x + b.width && a.position.x + a.width > b.position.x && a.position.y < b.position.y + b.height && a.position.y + a.height > b.position.y;
}

function assertNoOverlaps(nodes: AlgorithmFlowNode[]): void {
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      expect(overlaps(nodes[i]!, nodes[j]!)).toBe(false);
    }
  }
}

describe('layoutAlgorithmGraph', () => {
  it('positions a linear chain with every node finite and non-overlapping', async () => {
    const graph: AlgorithmGraph = {
      nodes: [node({ id: 'n1', type: 'assess' }), node({ id: 'n2', type: 'action', claimIds: ['c1'] }), node({ id: 'n3', type: 'outcome' })],
      edges: [
        { from: 'n1', to: 'n2', condition: { variable: 'x', op: '=', value: 1 } },
        { from: 'n2', to: 'n3', condition: { variable: 'y', op: '=', value: 1 } },
      ],
    };
    const { nodes, edges } = await layoutAlgorithmGraph(graph);
    expect(nodes).toHaveLength(3);
    for (const n of nodes) {
      expect(Number.isFinite(n.position.x)).toBe(true);
      expect(Number.isFinite(n.position.y)).toBe(true);
    }
    assertNoOverlaps(nodes);
    expect(edges).toHaveLength(2);
    expect(edges.every((e) => !e.data.isLoopBack)).toBe(true);
    expect(edges.find((e) => e.source === 'n1' && e.target === 'n2')?.label).toBe('x = 1');
  });

  it('places sibling branches of a decision node side by side, not overlapping', async () => {
    const graph: AlgorithmGraph = {
      nodes: [node({ id: 'n1', type: 'decision' }), node({ id: 'n2', type: 'outcome' }), node({ id: 'n3', type: 'outcome' })],
      edges: [
        { from: 'n1', to: 'n2', condition: { variable: 'length', op: '>', value: 20, unit: 'nt' } },
        { from: 'n1', to: 'n3', condition: { variable: 'length', op: '<', value: 20, unit: 'nt' } },
      ],
    };
    const { nodes } = await layoutAlgorithmGraph(graph);
    expect(nodes).toHaveLength(3);
    assertNoOverlaps(nodes);
    const n2 = nodes.find((n) => n.id === 'n2')!;
    const n3 = nodes.find((n) => n.id === 'n3')!;
    expect(n2.position.x).not.toBe(n3.position.x);
  });

  it('excludes an iterate back-edge from layering but still returns it as a loop-back edge, with every node positioned', async () => {
    const graph: AlgorithmGraph = {
      nodes: [node({ id: 'n1', type: 'action', claimIds: ['c1'] }), node({ id: 'n2', type: 'iterate' }), node({ id: 'n3', type: 'outcome' })],
      edges: [
        { from: 'n1', to: 'n2', condition: { variable: 'x', op: '=', value: 1 } },
        { from: 'n2', to: 'n1', condition: { variable: 'x', op: '=', value: 0 } },
        { from: 'n2', to: 'n3', condition: { variable: 'x', op: '=', value: 1 } },
      ],
    };
    const { nodes, edges } = await layoutAlgorithmGraph(graph);
    expect(nodes).toHaveLength(3);
    assertNoOverlaps(nodes);
    const loopEdges = edges.filter((e) => e.data.isLoopBack);
    expect(loopEdges).toHaveLength(1);
    expect(loopEdges[0]).toMatchObject({ source: 'n2', target: 'n1' });
    expect(edges.filter((e) => !e.data.isLoopBack)).toHaveLength(2);
  });

  it('gives a decision node a larger bounding box than a default node', async () => {
    const graph: AlgorithmGraph = {
      nodes: [node({ id: 'n1', type: 'decision' }), node({ id: 'n2', type: 'outcome' })],
      edges: [{ from: 'n1', to: 'n2', condition: { variable: 'x', op: '=', value: 1 } }],
    };
    const { nodes } = await layoutAlgorithmGraph(graph);
    const decision = nodes.find((n) => n.id === 'n1')!;
    const outcome = nodes.find((n) => n.id === 'n2')!;
    expect(decision.width * decision.height).toBeGreaterThan(outcome.width * outcome.height);
  });

  it('returns an empty layout for an empty graph', async () => {
    const { nodes, edges } = await layoutAlgorithmGraph({ nodes: [], edges: [] });
    expect(nodes).toEqual([]);
    expect(edges).toEqual([]);
  });
});
