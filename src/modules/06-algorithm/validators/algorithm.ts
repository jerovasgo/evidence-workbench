import type { AlgorithmEdge, AlgorithmGraph } from '../schemas/algorithm';

// Module 06 invariants (docs/architecture/06-algorithm-generator.md): "all must pass,
// else repair once, else abstain the whole view with an explanation." Invariant 5
// (edge conditions structured) is already enforced by AlgorithmGraphSchema at parse
// time, so it is not re-checked here. Invariant 9 (band derivable) depends on the
// not-yet-built band-computation step and is deferred to that code.

const NODE_CAP = 35;

export type AlgorithmInvariantViolation =
  | { kind: 'cycle'; nodeIds: string[] }
  | { kind: 'no_start' | 'multiple_starts'; nodeIds: string[] }
  | { kind: 'critical_check_after_non_critical'; edge: { from: string; to: string } }
  | { kind: 'leaf_not_terminal'; nodeId: string }
  | { kind: 'action_node_missing_claim'; nodeId: string }
  | { kind: 'claim_id_not_in_pool'; nodeId: string; claimId: string }
  | { kind: 'orphan_node'; nodeId: string }
  | { kind: 'node_cap_exceeded'; count: number; cap: number };

export interface AlgorithmValidationResult {
  ok: boolean;
  violations: AlgorithmInvariantViolation[];
}

export function validateAlgorithmGraph(
  graph: AlgorithmGraph,
  verifiedClaimIds: ReadonlySet<string>,
): AlgorithmValidationResult {
  const violations: AlgorithmInvariantViolation[] = [];
  const nodesById = new Map(graph.nodes.map((n) => [n.id, n]));

  if (graph.nodes.length > NODE_CAP) {
    violations.push({ kind: 'node_cap_exceeded', count: graph.nodes.length, cap: NODE_CAP });
  }

  const outgoing = new Map<string, AlgorithmEdge[]>();
  const incoming = new Map<string, AlgorithmEdge[]>();
  for (const node of graph.nodes) {
    outgoing.set(node.id, []);
    incoming.set(node.id, []);
  }
  for (const edge of graph.edges) {
    outgoing.get(edge.from)?.push(edge);
    incoming.get(edge.to)?.push(edge);
  }

  // Invariant 2: exactly one start (no incoming edges).
  const starts = graph.nodes.filter((n) => (incoming.get(n.id)?.length ?? 0) === 0);
  if (starts.length === 0) {
    violations.push({ kind: 'no_start', nodeIds: [] });
  } else if (starts.length > 1) {
    violations.push({ kind: 'multiple_starts', nodeIds: starts.map((s) => s.id) });
  }

  // Invariant 2 (critical checks precede non-critical steps on every path): no
  // edge may lead INTO a critical_check node from a non-critical_check node — that
  // would place the critical check after a non-critical step on that path.
  for (const edge of graph.edges) {
    const from = nodesById.get(edge.from);
    const to = nodesById.get(edge.to);
    if (to?.type === 'critical_check' && from && from.type !== 'critical_check') {
      violations.push({ kind: 'critical_check_after_non_critical', edge: { from: edge.from, to: edge.to } });
    }
  }

  // Invariant 1: acyclic, except an explicit `iterate` back-edge (bounded). An
  // iterate node's outgoing edges are the sanctioned back-edges, so they are
  // excluded from cycle detection; any other cycle is a real violation.
  const cycleEdges = graph.edges.filter((e) => nodesById.get(e.from)?.type !== 'iterate');
  const cycle = detectCycle(graph.nodes.map((n) => n.id), cycleEdges);
  if (cycle) {
    violations.push({ kind: 'cycle', nodeIds: cycle });
  }

  // Invariant 3: every leaf is outcome or abstain.
  for (const node of graph.nodes) {
    const isLeaf = (outgoing.get(node.id)?.length ?? 0) === 0;
    if (isLeaf && node.type !== 'outcome' && node.type !== 'abstain') {
      violations.push({ kind: 'leaf_not_terminal', nodeId: node.id });
    }
  }

  // Invariant 4: action/method nodes need >=1 claim; every cited claimId exists in the verified pool.
  for (const node of graph.nodes) {
    if ((node.type === 'action' || node.type === 'method') && node.claimIds.length === 0) {
      violations.push({ kind: 'action_node_missing_claim', nodeId: node.id });
    }
    for (const claimId of node.claimIds) {
      if (!verifiedClaimIds.has(claimId)) {
        violations.push({ kind: 'claim_id_not_in_pool', nodeId: node.id, claimId });
      }
    }
  }

  // Invariant 6 (no orphan nodes): only meaningful once there is a single start.
  if (starts.length === 1) {
    const reachable = bfsReachable(starts[0]!.id, outgoing);
    for (const node of graph.nodes) {
      if (!reachable.has(node.id)) {
        violations.push({ kind: 'orphan_node', nodeId: node.id });
      }
    }
  }

  return { ok: violations.length === 0, violations };
}

function detectCycle(nodeIds: string[], edges: AlgorithmEdge[]): string[] | null {
  const adjacency = new Map<string, string[]>();
  for (const id of nodeIds) adjacency.set(id, []);
  for (const edge of edges) adjacency.get(edge.from)?.push(edge.to);

  const state = new Map<string, 'visiting' | 'done'>();
  const stack: string[] = [];

  function visit(id: string): string[] | null {
    state.set(id, 'visiting');
    stack.push(id);
    for (const next of adjacency.get(id) ?? []) {
      const nextState = state.get(next);
      if (nextState === 'visiting') {
        const idx = stack.indexOf(next);
        return stack.slice(idx).concat(next);
      }
      if (nextState !== 'done') {
        const found = visit(next);
        if (found) return found;
      }
    }
    stack.pop();
    state.set(id, 'done');
    return null;
  }

  for (const id of nodeIds) {
    if (!state.has(id)) {
      const found = visit(id);
      if (found) return found;
    }
  }
  return null;
}

function bfsReachable(startId: string, outgoing: Map<string, AlgorithmEdge[]>): Set<string> {
  const visited = new Set<string>([startId]);
  const queue = [startId];
  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const edge of outgoing.get(current) ?? []) {
      if (!visited.has(edge.to)) {
        visited.add(edge.to);
        queue.push(edge.to);
      }
    }
  }
  return visited;
}

export type Provenance = 'local' | 'external' | 'both' | 'conflict';

/**
 * Invariant 8: provenance is derived by code, never trusted from the model. `conflict`
 * takes priority — a contradicting pair among the cited claims makes the step
 * contested regardless of where the claims come from.
 */
export function deriveProvenance(claimSources: { isLocal: boolean }[], hasContradiction: boolean): Provenance {
  if (hasContradiction) return 'conflict';
  const hasLocal = claimSources.some((c) => c.isLocal);
  const hasExternal = claimSources.some((c) => !c.isLocal);
  if (hasLocal && hasExternal) return 'both';
  return hasLocal ? 'local' : 'external';
}
