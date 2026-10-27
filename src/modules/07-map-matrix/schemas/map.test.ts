import { describe, expect, it } from 'vitest';
import {
  FlatMapNodeSchema,
  flattenMapNodes,
  MapNodeSchema,
  nestMapNodes,
  type FlatMapNode,
  type MapNode,
} from './map';

describe('MapNodeSchema', () => {
  it('accepts a nested tree', () => {
    const tree: MapNode = {
      id: 'root',
      kind: 'root',
      label: 'Chest pain work-up',
      children: [
        { id: 'q1', kind: 'subquestion', label: 'ECG timing?', children: [] },
      ],
    };
    expect(() => MapNodeSchema.parse(tree)).not.toThrow();
  });
});

describe('FlatMapNodeSchema', () => {
  it('accepts a flat node with a null parentId (root)', () => {
    const node: FlatMapNode = { id: 'root', parentId: null, kind: 'root', label: 'x' };
    expect(FlatMapNodeSchema.parse(node)).toEqual(node);
  });
});

describe('nestMapNodes / flattenMapNodes', () => {
  const flat: FlatMapNode[] = [
    { id: 'root', parentId: null, kind: 'root', label: 'Chest pain work-up' },
    { id: 'q1', parentId: 'root', kind: 'subquestion', label: 'ECG timing?' },
    { id: 'c1', parentId: 'q1', kind: 'claim', label: 'ECG within 10 min', claimId: 'claim_1' },
  ];

  it('nests a flat list into a tree with one root', () => {
    const tree = nestMapNodes(flat);
    expect(tree).toHaveLength(1);
    expect(tree[0]?.id).toBe('root');
    expect(tree[0]?.children[0]?.id).toBe('q1');
    expect(tree[0]?.children[0]?.children[0]?.claimId).toBe('claim_1');
  });

  it('round-trips through flattenMapNodes back to the same flat shape', () => {
    const tree = nestMapNodes(flat);
    const roundTripped = flattenMapNodes(tree);
    expect(new Set(roundTripped.map((n) => n.id))).toEqual(new Set(flat.map((n) => n.id)));
    for (const node of roundTripped) {
      const original = flat.find((n) => n.id === node.id);
      expect(node.parentId).toBe(original?.parentId);
    }
  });

  it('throws when a node references a missing parent (malformed model output)', () => {
    const broken: FlatMapNode[] = [{ id: 'orphan', parentId: 'ghost', kind: 'claim', label: 'x' }];
    expect(() => nestMapNodes(broken)).toThrow(/missing parent/);
  });

  it('throws on a cycle instead of looping forever', () => {
    const cyclic: FlatMapNode[] = [
      { id: 'a', parentId: 'b', kind: 'subquestion', label: 'a' },
      { id: 'b', parentId: 'a', kind: 'subquestion', label: 'b' },
    ];
    expect(() => nestMapNodes(cyclic)).toThrow(/cycle/);
  });
});
