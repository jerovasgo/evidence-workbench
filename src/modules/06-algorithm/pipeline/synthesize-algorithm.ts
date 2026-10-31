import { synthesizeAlgorithmGraph, type SynthesizeAlgorithmDeps } from '../agents/algorithm-synthesizer';
import { deriveProvenance, validateAlgorithmGraph, type AlgorithmInvariantViolation } from '../validators/algorithm';
import { findStartNodeId } from './flatten-algorithm';
import type { AlgorithmGraph } from '../schemas/algorithm';
import type { SynthesizeAlgorithmInput } from '../schemas/algorithm-synthesizer';

// Module 06 V1 orchestration (docs/DECISIONS.md "V1 scope decisions"):
// runAgent (called inside synthesizeAlgorithmGraph) already retries once on a
// schema-INVALID response; this layer adds exactly one more manual repair call
// when the response is schema-valid but fails `validateAlgorithmGraph`'s semantic
// invariants, feeding the violations back — "repair once, else abstain the whole
// view with an explanation" (architecture doc). No partial/wrong graph is ever
// returned: either both checks pass, or the caller gets an abstain reason.
//
// Reuses `SynthesizeAlgorithmDeps` (the agent's own deps shape) and
// `SynthesizeAlgorithmInput` (the schema's own input type) rather than redeclaring
// them here — both are identical in shape to what this file would otherwise define,
// and redeclaring caused a duplicate-export collision in this module's `index.ts`.

export interface AlgorithmBand {
  criticalChecks: string[];
  firstAction: string | null;
}

export type SynthesizeAlgorithmResult =
  | { status: 'ok'; graph: AlgorithmGraph; band: AlgorithmBand }
  | { status: 'abstained'; reason: string };

function formatViolations(violations: AlgorithmInvariantViolation[]): string {
  return violations.map((violation) => JSON.stringify(violation)).join('; ');
}

/**
 * Derived by code, not the model (architecture doc). V1: no local-document-upload
 * feature exists in this build and relation-labelling (the only source of
 * `contradicts` data `deriveProvenance` needs) runs after `done`, so it isn't
 * available yet when this runs — every claim is `isLocal: false`, nothing is known
 * to conflict. `deriveProvenance` itself is unchanged; this is what it already
 * returns given today's real inputs, not a weakened call.
 */
function applyProvenance(graph: AlgorithmGraph): AlgorithmGraph {
  const provenance = deriveProvenance([{ isLocal: false }], false);
  return { ...graph, nodes: graph.nodes.map((node) => ({ ...node, provenance })) };
}

/** The 10-second band (architecture doc): up to 4 `critical_check` nodes, plus the
 *  first `action`/`method` node reached by BFS from the graph's single start node
 *  (`findStartNodeId`, shared with the renderer so "what counts as the start" is
 *  defined in exactly one place). */
export function computeBand(graph: AlgorithmGraph): AlgorithmBand {
  const criticalChecks = graph.nodes.filter((node) => node.type === 'critical_check').map((node) => node.id).slice(0, 4);

  const nodesById = new Map(graph.nodes.map((node) => [node.id, node]));
  const outgoing = new Map<string, string[]>();
  for (const node of graph.nodes) outgoing.set(node.id, []);
  for (const edge of graph.edges) outgoing.get(edge.from)?.push(edge.to);
  const startId = findStartNodeId(graph);

  let firstAction: string | null = null;
  if (startId) {
    const visited = new Set<string>([startId]);
    const queue = [startId];
    while (queue.length > 0 && firstAction === null) {
      const currentId = queue.shift()!;
      const current = nodesById.get(currentId);
      if (current && (current.type === 'action' || current.type === 'method')) {
        firstAction = current.id;
        break;
      }
      for (const nextId of outgoing.get(currentId) ?? []) {
        if (!visited.has(nextId)) {
          visited.add(nextId);
          queue.push(nextId);
        }
      }
    }
  }

  return { criticalChecks, firstAction };
}

export async function synthesizeAlgorithm(
  runId: string,
  input: SynthesizeAlgorithmInput,
  deps: SynthesizeAlgorithmDeps,
): Promise<SynthesizeAlgorithmResult> {
  const verifiedClaimIds = new Set(input.claims.map((claim) => claim.id));

  const first = await synthesizeAlgorithmGraph(runId, input, deps);
  if (!first.ok) {
    return { status: 'abstained', reason: `Could not generate an algorithm for this question: ${first.detail}` };
  }

  const firstCheck = validateAlgorithmGraph(first.value, verifiedClaimIds);
  if (firstCheck.ok) {
    return { status: 'ok', graph: applyProvenance(first.value), band: computeBand(first.value) };
  }

  const repaired = await synthesizeAlgorithmGraph(runId, input, deps, formatViolations(firstCheck.violations));
  if (!repaired.ok) {
    return { status: 'abstained', reason: `Could not generate an algorithm for this question: ${repaired.detail}` };
  }

  const secondCheck = validateAlgorithmGraph(repaired.value, verifiedClaimIds);
  if (!secondCheck.ok) {
    return {
      status: 'abstained',
      reason: `The generated algorithm did not meet structural requirements after one repair attempt: ${formatViolations(secondCheck.violations)}`,
    };
  }

  return { status: 'ok', graph: applyProvenance(repaired.value), band: computeBand(repaired.value) };
}
