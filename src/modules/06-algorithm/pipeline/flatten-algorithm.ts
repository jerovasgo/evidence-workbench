import type { AlgorithmEdge, AlgorithmGraph, AlgorithmNode } from '../schemas/algorithm';

// Module 06 V1 renderer input (docs/DECISIONS.md, 2026-10-3x "V1 scope decisions"):
// a deterministic, code-computed vertical step list instead of a 2D graph canvas
// (React Flow/elkjs) — "layout is always computed by code, never by the model" is
// satisfied by this DFS order, just not as a spatial layout. Pure and tested like
// `07-map-matrix/pipeline/evidence-matrix.ts`.

export interface FlattenedAlgorithmEntry {
  node: AlgorithmNode;
  depth: number;
  /** The edge condition that led to this node from its parent, e.g. "guide_length > 20 nt". Absent for the start node. */
  edgeLabel?: string;
  /** True when this entry repeats a node already rendered earlier in the walk (an
   *  `iterate` back-edge target) — the renderer shows a short back-link instead of
   *  the full node and its subtree again, avoiding infinite recursion on a cycle. */
  isBackReference?: boolean;
}

function formatCondition(condition: AlgorithmEdge['condition']): string {
  return `${condition.variable} ${condition.op} ${condition.value}${condition.unit ? ` ${condition.unit}` : ''}`;
}

/** The graph's single start node (no incoming edges) — `validateAlgorithmGraph`'s
 *  invariant 2 guarantees exactly one exists on any graph this function is handed;
 *  `null` only for a graph that somehow skipped validation. Shared by the band
 *  computation (`pipeline/synthesize-algorithm.ts`) and the renderer so "what counts
 *  as the start" is defined in exactly one place. */
export function findStartNodeId(graph: AlgorithmGraph): string | null {
  const hasIncoming = new Set(graph.edges.map((edge) => edge.to));
  return graph.nodes.find((node) => !hasIncoming.has(node.id))?.id ?? null;
}

/** Deterministic DFS from `startId`; never re-expands a node it has already visited. */
export function flattenAlgorithmGraph(graph: AlgorithmGraph, startId: string): FlattenedAlgorithmEntry[] {
  const nodesById = new Map(graph.nodes.map((node) => [node.id, node]));
  const outgoing = new Map<string, AlgorithmEdge[]>();
  for (const node of graph.nodes) outgoing.set(node.id, []);
  for (const edge of graph.edges) outgoing.get(edge.from)?.push(edge);

  const result: FlattenedAlgorithmEntry[] = [];
  const visited = new Set<string>();

  function visit(nodeId: string, depth: number, edgeLabel: string | undefined): void {
    const node = nodesById.get(nodeId);
    if (!node) return; // edge points at a node id the graph doesn't define — nothing to render
    if (visited.has(nodeId)) {
      result.push({ node, depth, edgeLabel, isBackReference: true });
      return;
    }
    visited.add(nodeId);
    result.push({ node, depth, edgeLabel });
    for (const edge of outgoing.get(nodeId) ?? []) {
      visit(edge.to, depth + 1, formatCondition(edge.condition));
    }
  }

  if (nodesById.has(startId)) visit(startId, 0, undefined);
  return result;
}
