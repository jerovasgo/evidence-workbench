import { z } from 'zod';

// SPEC §8: MapNode is a tree (children: MapNode[]). The Meta API rejects recursive
// structured-output schemas (docs/DAY0-VERIFICATION.md), so agent output must use
// FlatMapNodeSchema (nodes[] + parentId) and code nests it into MapNodeSchema below.

export interface MapNode {
  id: string;
  kind: 'root' | 'subquestion' | 'claim';
  label: string;
  claimId?: string;
  children: MapNode[];
}

export const MapNodeSchema: z.ZodType<MapNode> = z.lazy(() =>
  z.object({
    id: z.string(),
    kind: z.enum(['root', 'subquestion', 'claim']),
    label: z.string(),
    claimId: z.string().optional(),
    children: z.array(MapNodeSchema),
  }),
);

export const FlatMapNodeSchema = z.object({
  id: z.string(),
  parentId: z.string().nullable(),
  kind: z.enum(['root', 'subquestion', 'claim']),
  label: z.string(),
  claimId: z.string().optional(),
});
export type FlatMapNode = z.infer<typeof FlatMapNodeSchema>;

export const MatrixSchema = z.object({
  rows: z.array(
    z.object({
      question: z.string(),
      claimByColumn: z.record(z.string(), z.string().nullable()),
    }),
  ),
  columns: z.array(z.object({ sourceId: z.string() })),
});
export type Matrix = z.infer<typeof MatrixSchema>;

/**
 * Nests a flat node list (agent output shape) into the MapNode tree (render/storage
 * shape). Throws on a missing parent or a cycle so a malformed model output cannot
 * silently become a broken tree — the caller (runAgent's validation step) should treat
 * that as an invalid-output abstention, not a thrown exception reaching the UI.
 */
export function nestMapNodes(flat: FlatMapNode[]): MapNode[] {
  const parentIdOf = new Map<string, string | null>();
  for (const node of flat) parentIdOf.set(node.id, node.parentId);

  // Cycle check by walking each node's parent chain, independent of which nodes are
  // reachable from a declared root — a cycle with no root (e.g. a -> b -> a) would
  // otherwise never be visited by a root-down traversal.
  for (const node of flat) {
    const seen = new Set<string>([node.id]);
    let parentId = node.parentId;
    while (parentId !== null) {
      if (seen.has(parentId)) {
        throw new Error(`nestMapNodes: cycle detected at node "${parentId}"`);
      }
      seen.add(parentId);
      if (!parentIdOf.has(parentId)) {
        throw new Error(`nestMapNodes: node "${node.id}" references missing parent "${parentId}"`);
      }
      parentId = parentIdOf.get(parentId) ?? null;
    }
  }

  const byId = new Map<string, MapNode>();
  for (const node of flat) {
    byId.set(node.id, { ...node, claimId: node.claimId, children: [] });
  }

  const roots: MapNode[] = [];
  for (const node of flat) {
    const current = byId.get(node.id);
    if (!current) continue;
    if (node.parentId === null) {
      roots.push(current);
      continue;
    }
    // Existence of the parent was already confirmed by the cycle-check walk above.
    const parent = byId.get(node.parentId) as MapNode;
    parent.children.push(current);
  }

  return roots;
}

/** Inverse of nestMapNodes, used when re-sending an existing tree back to an agent. */
export function flattenMapNodes(tree: MapNode[], parentId: string | null = null): FlatMapNode[] {
  const out: FlatMapNode[] = [];
  for (const node of tree) {
    out.push({ id: node.id, parentId, kind: node.kind, label: node.label, claimId: node.claimId });
    out.push(...flattenMapNodes(node.children, node.id));
  }
  return out;
}
