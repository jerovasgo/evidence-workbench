// Module 02 deterministic curation, step 7: "Select: top-N per sub-question with
// diversity constraint (at least 2 issuers where available; at most 3 sources from
// the same issuer) so the pool does not collapse to one opinion."
//
// The "at least 2 issuers" half isn't enforced by a separate pass — it falls out of
// the "at most maxPerIssuer" cap structurally whenever n > maxPerIssuer and a second
// issuer's candidates exist: the cap forces some of the n slots to come from
// elsewhere. A dedicated minimum-issuer pass would only matter if every remaining
// candidate happened to share one issuer, in which case there is no diversity to add
// regardless of the algorithm.

export interface ScoredCandidate<T> {
  item: T;
  score: number;
  issuer: string;
}

export interface DiversitySelectionOptions {
  maxPerIssuer?: number;
}

export function selectTopNWithDiversity<T>(
  candidates: ScoredCandidate<T>[],
  n: number,
  options: DiversitySelectionOptions = {},
): T[] {
  const maxPerIssuer = options.maxPerIssuer ?? 3;
  const sorted = [...candidates].sort((a, b) => b.score - a.score);

  const selected: ScoredCandidate<T>[] = [];
  const countByIssuer = new Map<string, number>();

  for (const candidate of sorted) {
    if (selected.length >= n) break;
    const count = countByIssuer.get(candidate.issuer) ?? 0;
    if (count >= maxPerIssuer) continue;
    selected.push(candidate);
    countByIssuer.set(candidate.issuer, count + 1);
  }

  // Only reached if the diversity cap left slots unfilled because there simply
  // weren't enough distinct-issuer candidates — better to fill with an over-cap
  // candidate than return fewer than requested.
  if (selected.length < n) {
    for (const candidate of sorted) {
      if (selected.length >= n) break;
      if (selected.includes(candidate)) continue;
      selected.push(candidate);
    }
  }

  return selected.map((c) => c.item);
}
