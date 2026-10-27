// Module 02 deterministic curation, step 3: "group guideline versions (same issuer +
// topic); keep latest as current, mark older supersededBy; ... treat updates, focused
// updates and addenda explicitly (child records, not replacements, unless stated)."
//
// Grouping candidates by issuer+topic is NLP-ish work left to the caller (no generic
// "topic" extraction exists yet); this function only resolves versions *within* an
// already-formed group, which is the part that is pure and deterministic.

export interface VersionCandidate {
  id: string;
  year: number;
  /** An addendum/focused update is a child record alongside the guideline it updates,
   *  never a replacement for it — it is excluded from "current vs superseded" entirely. */
  isAddendum?: boolean;
}

/** Maps each candidate's id to the id of the current version that supersedes it (null if it IS current or an addendum). */
export function resolveVersions(group: VersionCandidate[]): Map<string, string | null> {
  const result = new Map<string, string | null>();

  const mainLine = group.filter((c) => !c.isAddendum);
  const current = mainLine.reduce<VersionCandidate | null>(
    (latest, candidate) => (latest === null || candidate.year > latest.year ? candidate : latest),
    null,
  );

  for (const candidate of group) {
    if (candidate.isAddendum) {
      result.set(candidate.id, null);
      continue;
    }
    result.set(candidate.id, candidate.id === current?.id ? null : current?.id ?? null);
  }

  return result;
}
