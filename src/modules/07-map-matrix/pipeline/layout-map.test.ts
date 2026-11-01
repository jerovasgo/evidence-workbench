import { describe, expect, it } from 'vitest';
import type { MapNode } from '../schemas/map';
import { layoutMapTree, type MapFlowNode } from './layout-map';

function node(overrides: Partial<MapNode> & { id: string; kind: MapNode['kind'] }): MapNode {
  return { label: overrides.id, children: [], ...overrides };
}

function overlaps(a: MapFlowNode, b: MapFlowNode): boolean {
  return a.position.x < b.position.x + b.width && a.position.x + a.width > b.position.x && a.position.y < b.position.y + b.height && a.position.y + a.height > b.position.y;
}

function assertNoOverlaps(nodes: MapFlowNode[]): void {
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      expect(overlaps(nodes[i]!, nodes[j]!)).toBe(false);
    }
  }
}

describe('layoutMapTree', () => {
  it('positions a single branch with its claims, every node finite and non-overlapping', async () => {
    const tree: MapNode[] = [
      node({
        id: 'root', kind: 'root', children: [
          node({
            id: 'sq-0', kind: 'subquestion', children: [
              node({ id: 'claim-a', kind: 'claim', claimId: 'a' }),
              node({ id: 'claim-b', kind: 'claim', claimId: 'b' }),
            ],
          }),
        ],
      }),
    ];
    const { nodes, edges } = await layoutMapTree(tree);
    expect(nodes).toHaveLength(4);
    for (const n of nodes) {
      expect(Number.isFinite(n.position.x)).toBe(true);
      expect(Number.isFinite(n.position.y)).toBe(true);
    }
    assertNoOverlaps(nodes);
    expect(edges).toHaveLength(3);
    expect(edges.some((e) => e.source === 'root' && e.target === 'sq-0')).toBe(true);
  });

  it('positions a wide tree (7 branches, several claims each) with no overlapping boxes', async () => {
    const branches = Array.from({ length: 7 }, (_, i) =>
      node({
        id: `sq-${i}`, kind: 'subquestion', children: Array.from({ length: 4 }, (_, j) => node({ id: `claim-${i}-${j}`, kind: 'claim', claimId: `c${i}${j}` })),
      }));
    const tree: MapNode[] = [node({ id: 'root', kind: 'root', children: branches })];
    const { nodes } = await layoutMapTree(tree);
    expect(nodes).toHaveLength(1 + 7 + 7 * 4);
    assertNoOverlaps(nodes);
  });

  it('returns an empty layout for an empty tree', async () => {
    const { nodes, edges } = await layoutMapTree([]);
    expect(nodes).toEqual([]);
    expect(edges).toEqual([]);
  });
});
