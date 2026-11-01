import { synthesizeMechanismGraph, type SynthesizeMechanismDeps } from '../agents/mechanism-synthesizer';
import { validateMechanismGraph, type MechanismInvariantViolation } from '../validators/mechanism';
import type { MechanismGraph } from '../schemas/mechanism';
import type { SynthesizeMechanismInput } from '../schemas/mechanism-synthesizer';

// Module 08 V1 orchestration (docs/DECISIONS.md "V1 scope decisions"): mirrors
// `06-algorithm/pipeline/synthesize-algorithm.ts` exactly. `runAgent` (called
// inside synthesizeMechanismGraph) already retries once on a schema-INVALID
// response; this layer adds exactly one more manual repair call when the
// response is schema-valid but fails `validateMechanismGraph`'s semantic
// invariants, feeding the violations back — "repair once, else abstain the whole
// view with an explanation." No partial/wrong graph is ever returned: either
// both checks pass, or the caller gets an abstain reason.

export type SynthesizeMechanismResult =
  | { status: 'ok'; graph: MechanismGraph }
  | { status: 'abstained'; reason: string };

function formatViolations(violations: MechanismInvariantViolation[]): string {
  return violations.map((violation) => JSON.stringify(violation)).join('; ');
}

export async function synthesizeMechanism(
  runId: string,
  input: SynthesizeMechanismInput,
  deps: SynthesizeMechanismDeps,
): Promise<SynthesizeMechanismResult> {
  const verifiedClaimIds = new Set(input.claims.map((claim) => claim.id));

  const first = await synthesizeMechanismGraph(runId, input, deps);
  if (!first.ok) {
    return { status: 'abstained', reason: `Could not generate a mechanism diagram for this question: ${first.detail}` };
  }

  const firstCheck = validateMechanismGraph(first.value, verifiedClaimIds);
  if (firstCheck.ok) {
    return { status: 'ok', graph: first.value };
  }

  const repaired = await synthesizeMechanismGraph(runId, input, deps, formatViolations(firstCheck.violations));
  if (!repaired.ok) {
    return { status: 'abstained', reason: `Could not generate a mechanism diagram for this question: ${repaired.detail}` };
  }

  const secondCheck = validateMechanismGraph(repaired.value, verifiedClaimIds);
  if (!secondCheck.ok) {
    return {
      status: 'abstained',
      reason: `The generated mechanism diagram did not meet structural requirements after one repair attempt: ${formatViolations(secondCheck.violations)}`,
    };
  }

  return { status: 'ok', graph: repaired.value };
}
