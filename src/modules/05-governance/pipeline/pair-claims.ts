import { isVerifiedClaim, type Claim } from '@/shared/domain';

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

/** Deterministically finds candidate cross-source claim pairs worth asking the model to relate — never the model's own job to find pairs, only to judge ones code already selected. */
export function pairClaimsForRelations(claims: Claim[]): ClaimPair[] {
  const pairs: ClaimPair[] = [];

  outer: for (let i = 0; i < claims.length; i++) {
    for (let j = i + 1; j < claims.length; j++) {
      const a = claims[i]!;
      const b = claims[j]!;
      if (!isVerifiedClaim(a) || !isVerifiedClaim(b)) continue;
      if (a.subQuestionIndex === undefined || a.subQuestionIndex !== b.subQuestionIndex) continue;
      if (a.basis !== 'primary' || b.basis !== 'primary') continue;
      if (a.sourceId === b.sourceId) continue;
      if (a.actionType !== b.actionType) continue;


      pairs.push({ a, b });
      if (pairs.length >= MAX_PAIRS) break outer;
    }
  }

  return pairs;
}
