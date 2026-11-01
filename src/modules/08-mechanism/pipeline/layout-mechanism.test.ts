import { describe, expect, it } from 'vitest';
import type { MechanismGraph } from '../schemas/mechanism';
import { layoutMechanismGraph, type MechanismFlowNode } from './layout-mechanism';

function entity(overrides: Partial<MechanismGraph['entities'][number]> & { id: string; kind: MechanismGraph['entities'][number]['kind'] }) {
  return { label: overrides.id, ...overrides };
}

function interaction(overrides: Partial<MechanismGraph['interactions'][number]> & { id: string; from: string; to: string; claimId: string }) {
  return { type: 'activates' as const, sign: '+' as const, order: 0, ...overrides };
}

function overlaps(a: MechanismFlowNode, b: MechanismFlowNode): boolean {
  return a.position.x < b.position.x + b.width && a.position.x + a.width > b.position.x && a.position.y < b.position.y + b.height && a.position.y + a.height > b.position.y;
}

function assertNoOverlaps(nodes: MechanismFlowNode[]): void {
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      expect(overlaps(nodes[i]!, nodes[j]!)).toBe(false);
    }
  }
}

describe('layoutMechanismGraph', () => {
  it('positions a linear cascade with every node finite and non-overlapping', async () => {
    const graph: MechanismGraph = {
      scope: 'test',
      entities: [entity({ id: 'e1', kind: 'ligand' }), entity({ id: 'e2', kind: 'receptor' }), entity({ id: 'e3', kind: 'second_messenger' })],
      interactions: [
        interaction({ id: 'i1', from: 'e1', to: 'e2', claimId: 'c1' }),
        interaction({ id: 'i2', from: 'e2', to: 'e3', claimId: 'c2', order: 1, type: 'produces' }),
      ],
    };
    const { nodes, edges } = await layoutMechanismGraph(graph);
    expect(nodes).toHaveLength(3);
    for (const n of nodes) {
      expect(Number.isFinite(n.position.x)).toBe(true);
      expect(Number.isFinite(n.position.y)).toBe(true);
    }
    assertNoOverlaps(nodes);
    expect(edges).toHaveLength(2);
    expect(edges.find((e) => e.source === 'e2' && e.target === 'e3')?.label).toBe('produces');
  });

  it('still positions every node when the graph has a genuine feedback cycle', async () => {
    const graph: MechanismGraph = {
      scope: 'test',
      entities: [entity({ id: 'e1', kind: 'enzyme' }), entity({ id: 'e2', kind: 'second_messenger' })],
      interactions: [
        interaction({ id: 'i1', from: 'e1', to: 'e2', claimId: 'c1' }),
        interaction({ id: 'i2', from: 'e2', to: 'e1', claimId: 'c2', type: 'inhibits', sign: '-' }),
      ],
    };
    const { nodes, edges } = await layoutMechanismGraph(graph);
    expect(nodes).toHaveLength(2);
    assertNoOverlaps(nodes);
    expect(edges).toHaveLength(2);
  });

  it('returns an empty layout for an empty graph', async () => {
    const { nodes, edges } = await layoutMechanismGraph({ scope: '', entities: [], interactions: [] });
    expect(nodes).toEqual([]);
    expect(edges).toEqual([]);
  });
});
