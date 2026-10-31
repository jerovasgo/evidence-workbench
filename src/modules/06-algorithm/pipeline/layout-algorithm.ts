import ELK from 'elkjs/lib/elk.bundled.js';
import type { ElkNode } from 'elkjs/lib/elk-api';
import type { AlgorithmEdge, AlgorithmGraph, AlgorithmNode } from '../schemas/algorithm';

// Module 06 V1.1 (docs/DECISIONS.md, 2026-10-31): the real flowchart canvas's layout,
// computed by elkjs (layered, top-to-bottom) — still 100% code-computed, never
// model-positioned ("layout is always computed by code, never by the model", same
// rule V1's DFS depth satisfied, just a real layered-graph algorithm instead of a
// hand-rolled indent). A true back-edge (DFS: targets a node still on the current
// path, i.e. an `iterate` node's loop-back edge per invariant 1) is excluded from
// the layering input so elk's layered algorithm — which assumes a DAG — never sees a
// cycle, and is re-attached after layout as a separate "loop back" edge for the
// renderer to draw distinctly (dashed, curved). This is precise DFS back-edge
// detection, not a blanket "every edge FROM an iterate node" filter: an `iterate`
// node's other, forward edge (e.g. "continue" vs. "retry") stays a normal layering
// edge so the node it points to is positioned relative to the flow, not orphaned.

export interface AlgorithmFlowNodeData extends Record<string, unknown> {
  node: AlgorithmNode;
}
export interface AlgorithmFlowNode {
  id: string;
  type: AlgorithmNode['type'];
  position: { x: number; y: number };
  width: number;
  height: number;
  data: AlgorithmFlowNodeData;
}

export interface AlgorithmFlowEdgeData extends Record<string, unknown> {
  isLoopBack: boolean;
}
export interface AlgorithmFlowEdge {
  id: string;
  source: string;
  target: string;
  /** Top-level, not nested in `data` — matches `@xyflow/react`'s own `Edge.label` prop so the caller can spread this directly. */
  label: string;
  data: AlgorithmFlowEdgeData;
}

export interface AlgorithmLayout {
  nodes: AlgorithmFlowNode[];
  edges: AlgorithmFlowEdge[];
}

// Decision is square (not a wide rect) so the renderer can rotate an inner square
// 45° into a true diamond and have its rotated footprint (~1.41x the inner square)
// still fit inside this box with margin — a wide rect rotated 45° would overflow
// its neighbors' ELK-computed spacing instead of just looking like a diamond.
const DECISION_SIZE = { width: 190, height: 190 };
const DEFAULT_SIZE = { width: 220, height: 88 };

function nodeSize(type: AlgorithmNode['type']): { width: number; height: number } {
  return type === 'decision' ? DECISION_SIZE : DEFAULT_SIZE;
}

/** Shared with `flatten-algorithm.ts`'s identical helper — kept local here since the
 *  two pipeline files serve different renderers and neither depends on the other. */
function formatCondition(condition: AlgorithmEdge['condition']): string {
  return `${condition.variable} ${condition.op} ${condition.value}${condition.unit ? ` ${condition.unit}` : ''}`;
}

/** Standard DFS back-edge detection: an edge targets a node still on the current
 *  recursion path ('visiting'), not just any already-seen node — so a node reached
 *  by two different forward paths (a converging branch) is never mistaken for a
 *  cycle, only a genuine loop is. Returns the indices into `graph.edges`. */
function findBackEdgeIndices(graph: AlgorithmGraph): Set<number> {
  const outgoing = new Map<string, { to: string; index: number }[]>();
  for (const node of graph.nodes) outgoing.set(node.id, []);
  graph.edges.forEach((edge, index) => outgoing.get(edge.from)?.push({ to: edge.to, index }));

  const state = new Map<string, 'visiting' | 'done'>();
  const backEdgeIndices = new Set<number>();

  function visit(id: string): void {
    state.set(id, 'visiting');
    for (const { to, index } of outgoing.get(id) ?? []) {
      const toState = state.get(to);
      if (toState === 'visiting') backEdgeIndices.add(index);
      else if (toState !== 'done') visit(to);
    }
    state.set(id, 'done');
  }

  for (const node of graph.nodes) {
    if (!state.has(node.id)) visit(node.id);
  }
  return backEdgeIndices;
}

export async function layoutAlgorithmGraph(graph: AlgorithmGraph): Promise<AlgorithmLayout> {
  const nodesById = new Map(graph.nodes.map((node) => [node.id, node]));
  const backEdgeIndices = findBackEdgeIndices(graph);
  const layoutEdges = graph.edges.filter((_, index) => !backEdgeIndices.has(index));
  const loopBackEdges = graph.edges.filter((_, index) => backEdgeIndices.has(index));

  const elk = new ELK();
  const elkGraph: ElkNode = {
    id: 'root',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': 'DOWN',
      'elk.layered.spacing.nodeNodeBetweenLayers': '64',
      'elk.spacing.nodeNode': '48',
    },
    children: graph.nodes.map((node) => ({ id: node.id, ...nodeSize(node.type) })),
    edges: layoutEdges.map((edge, index) => ({
      id: `e${index}`,
      sources: [edge.from],
      targets: [edge.to],
    })),
  };

  const result = await elk.layout(elkGraph);

  const nodes: AlgorithmFlowNode[] = (result.children ?? []).flatMap((child) => {
    const node = nodesById.get(child.id);
    if (!node) return [];
    const size = nodeSize(node.type);
    return [{ id: node.id, type: node.type, position: { x: child.x ?? 0, y: child.y ?? 0 }, width: size.width, height: size.height, data: { node } }];
  });

  const edges: AlgorithmFlowEdge[] = [
    ...layoutEdges.map((edge, index) => ({ id: `edge-${index}-${edge.from}-${edge.to}`, source: edge.from, target: edge.to, label: formatCondition(edge.condition), data: { isLoopBack: false } })),
    ...loopBackEdges.map((edge, index) => ({ id: `loop-${index}-${edge.from}-${edge.to}`, source: edge.from, target: edge.to, label: formatCondition(edge.condition), data: { isLoopBack: true } })),
  ];

  return { nodes, edges };
}
