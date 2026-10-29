import type { Claim } from '@/shared/domain';

// Module 05 `relation-labeller` (P7): "pairing by code first: same actionType +
// overlapping conditions + semantic key from sub-question assignment"
// (docs/architecture/05-governance-local-vs-external.md). The sub-question part of
// that heuristic isn't buildable yet — claims don't carry which sub-question they
// answer (claim-extractor's own output schema has no such field) — so this is the
// honest subset: same actionType, different source, compatible conditions. Logged
// as a known gap (SECURITY.md), not silently invented.
//
// This pass is cross-source only: both claims must come from different sourceId,
// which also means this never needs a local protocol document — it works purely
// from claims the retrieval/extraction pipeline already verified.

const MAX_PAIRS = 60; // cost/latency guard — same bounded-scope philosophy as extraction's maxSources

export interface ClaimPair {
  a: Claim;
  b: Claim;
}

/**
 * Two claims' `conditions` are "overlapping" if either is unconditioned (broadly
 * applicable, so could still relate to a conditioned claim) or they share at least
 * one condition on the same `variable` — the exact operator/value isn't compared
 * here; that finer judgement is the model's job (P7), not code's.
 */
function conditionsCompatible(a: Claim['conditions'], b: Claim['conditions']): boolean {
  if (a.length === 0 || b.length === 0) return true;
  return a.some((ca) => b.some((cb) => ca.variable === cb.variable));
}

/** Deterministically finds candidate cross-source claim pairs worth asking the model to relate — never the model's own job to find pairs, only to judge ones code already selected. */
export function pairClaimsForRelations(claims: Claim[]): ClaimPair[] {
  const pairs: ClaimPair[] = [];

  outer: for (let i = 0; i < claims.length; i++) {
    for (let j = i + 1; j < claims.length; j++) {
      const a = claims[i]!;
      const b = claims[j]!;
      if (a.sourceId === b.sourceId) continue;
      if (a.actionType !== b.actionType) continue;
      if (!conditionsCompatible(a.conditions, b.conditions)) continue;

      pairs.push({ a, b });
      if (pairs.length >= MAX_PAIRS) break outer;
    }
  }

  return pairs;
}
