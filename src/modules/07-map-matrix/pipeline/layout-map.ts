import ELK from 'elkjs/lib/elk.bundled.js';
import type { ElkNode } from 'elkjs/lib/elk-api';
import { flattenMapNodes, type MapNode } from '../schemas/map';

// Module 07 V1 (docs/DECISIONS.md, 2026-11-01): elkjs's own `radial` algorithm
// (`elk.algorithm: 'radial'`), not d3-hierarchy — SPEC names either; elkjs is
// already a dependency (modules 06/08), d3-hierarchy is not installed. Reuses
// `flattenMapNodes` (schemas/map.ts, already written for the inverse of
// `nestMapNodes`) to turn the tree into the flat {id, parentId}[] shape ELK and
// React Flow both want — same "code computes layout, the model never does" rule as
// `layout-algorithm.ts`/`layout-mechanism.ts`, just a radial algorithm instead of a
// layered one.

export interface MapFlowNodeData extends Record<string, unknown> {
  node: MapNode;
}
export interface MapFlowNode {
  id: string;
  type: MapNode['kind'];
  position: { x: number; y: number };
  width: number;
  height: number;
  data: MapFlowNodeData;
}

export interface MapFlowEdge {
  id: string;
  source: string;
  target: string;
}

export interface MapLayout {
  nodes: MapFlowNode[];
  edges: MapFlowEdge[];
}

const NODE_SIZE: Record<MapNode['kind'], { width: number; height: number }> = {
  root: { width: 160, height: 64 },
  subquestion: { width: 180, height: 56 },
  claim: { width: 200, height: 72 },
};

export async function layoutMapTree(tree: MapNode[]): Promise<MapLayout> {
  const flat = flattenMapNodes(tree);
  const nodesById = new Map(flat.map((node) => [node.id, node]));

  const elk = new ELK();
  const elkGraph: ElkNode = {
    id: 'root',
    // No explicit 'elk.radial.radius': a fixed ring radius doesn't account for this
    // tree's actual node sizes and produced real overlaps at the root (confirmed with
    // a smoke test) — leaving it unset lets elk compute per-ring radius from the
    // nodes' own dimensions, which the layout test below also now covers.
    layoutOptions: {
      'elk.algorithm': 'radial',
      'elk.spacing.nodeNode': '40',
    },
    children: flat.map((node) => ({ id: node.id, ...NODE_SIZE[node.kind] })),
    edges: flat.filter((node) => node.parentId !== null).map((node, index) => ({
      id: `e${index}`,
      sources: [node.parentId!],
      targets: [node.id],
    })),
  };

  const result = await elk.layout(elkGraph);

  const nodes: MapFlowNode[] = (result.children ?? []).flatMap((child) => {
    const flatNode = nodesById.get(child.id);
    if (!flatNode) return [];
    const mapNode: MapNode = { id: flatNode.id, kind: flatNode.kind, label: flatNode.label, claimId: flatNode.claimId, children: [] };
    const size = NODE_SIZE[flatNode.kind];
    return [{ id: flatNode.id, type: flatNode.kind, position: { x: child.x ?? 0, y: child.y ?? 0 }, width: size.width, height: size.height, data: { node: mapNode } }];
  });

  const edges: MapFlowEdge[] = flat
    .filter((node) => node.parentId !== null)
    .map((node) => ({ id: `edge-${node.parentId}-${node.id}`, source: node.parentId!, target: node.id }));

  return { nodes, edges };
}
