import type { MechanismGraph } from '../schemas/mechanism';

// Module 08 V1 invariants (docs/architecture/08-mechanism-diagrams.md,
// docs/DECISIONS.md "V1 scope decisions"): "all must pass, else repair once,
// else abstain the whole view with an explanation" — same contract
// `validateAlgorithmGraph` (module 06) already follows. Deliberately minimal
// for V1: favors showing a correct graph over abstaining on a technicality.
// Second-messenger producer/consumer and compartment-consistency are asked for
// in the P16 prompt but NOT hard-enforced here — encoding them safely needs the
// cross-reference data this version doesn't have (logged, not a silent gap).

const ENTITY_CAP = 25;
const INTERACTION_CAP = 40;

export type MechanismInvariantViolation =
  | { kind: 'claim_id_not_in_pool'; interactionId: string; claimId: string }
  | { kind: 'unknown_entity_ref'; interactionId: string; entityId: string; end: 'from' | 'to' }
  | { kind: 'orphan_entity'; entityId: string }
  | { kind: 'entity_cap_exceeded'; count: number; cap: number }
  | { kind: 'interaction_cap_exceeded'; count: number; cap: number };

export interface MechanismValidationResult {
  ok: boolean;
  violations: MechanismInvariantViolation[];
}

export function validateMechanismGraph(
  graph: MechanismGraph,
  verifiedClaimIds: ReadonlySet<string>,
): MechanismValidationResult {
  const violations: MechanismInvariantViolation[] = [];
  const entityIds = new Set(graph.entities.map((entity) => entity.id));

  if (graph.entities.length > ENTITY_CAP) {
    violations.push({ kind: 'entity_cap_exceeded', count: graph.entities.length, cap: ENTITY_CAP });
  }
  if (graph.interactions.length > INTERACTION_CAP) {
    violations.push({ kind: 'interaction_cap_exceeded', count: graph.interactions.length, cap: INTERACTION_CAP });
  }

  // Invariant: referential integrity + claim grounding. "Model proposes, code
  // verifies" — a hallucinated claim id or entity id drops the whole graph to
  // invalid, same as module 06's claim_id_not_in_pool check.
  const referencedEntityIds = new Set<string>();
  for (const interaction of graph.interactions) {
    if (!verifiedClaimIds.has(interaction.claimId)) {
      violations.push({ kind: 'claim_id_not_in_pool', interactionId: interaction.id, claimId: interaction.claimId });
    }
    if (!entityIds.has(interaction.from)) {
      violations.push({ kind: 'unknown_entity_ref', interactionId: interaction.id, entityId: interaction.from, end: 'from' });
    } else {
      referencedEntityIds.add(interaction.from);
    }
    if (!entityIds.has(interaction.to)) {
      violations.push({ kind: 'unknown_entity_ref', interactionId: interaction.id, entityId: interaction.to, end: 'to' });
    } else {
      referencedEntityIds.add(interaction.to);
    }
  }

  // Invariant: no entity with no role in the graph (a looser stand-in for
  // "graph connected from the trigger" — mechanism graphs aren't guaranteed to
  // have one canonical single start the way an algorithm graph does).
  for (const entity of graph.entities) {
    if (!referencedEntityIds.has(entity.id)) {
      violations.push({ kind: 'orphan_entity', entityId: entity.id });
    }
  }

  return { ok: violations.length === 0, violations };
}
