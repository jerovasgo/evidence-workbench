import type { Grade } from '@/shared/domain';

// Module 04 deterministic grade-maps (docs/architecture/04-grading-and-scoring.md):
// "Import before estimate... copy it verbatim into nativeGrade and map it to the
// common scale by a deterministic table. Do not invent mappings." 2026-10-29 pivot
// (docs/DECISIONS.md): the four hardcoded clinical schemes (ACC/AHA, GRADE, USPSTF,
// Oxford CEBM) are replaced with one general-science certainty mapper. Unlike
// clinical guidelines, general-science papers rarely print a formal grade — most
// sources will honestly fall through to `certainty: 'ungraded'` ("not graded" in the
// UI), same as any source whose scheme this file doesn't recognize. That is a
// consequence of the domain, not a new gap: this project's standing policy (the
// cancelled grade-estimator decision, docs/DECISIONS.md) is "never infer a grade —
// show one only if the source states it explicitly."

type Certainty = Grade['certainty'];

export interface GradeMapResult {
  certainty: Certainty;
  /** Which scheme matched, for the "source scheme not mapped" vs "From source: X" UI label — not part of the stored `Grade`. */
  scheme: string;
}

/**
 * General-science certainty language: recognizes the phrases papers and reviews
 * actually use to characterize how settled a finding is, rather than a single
 * field-specific grading scheme (general science has no one equivalent of a
 * clinical guideline's "Class I / Level A"). Each phrase maps to the same four-tier
 * certainty scale already used elsewhere in this project — this is an honest
 * crosswalk of common usage, not an official standard, and is logged as such.
 */
function mapGeneralScienceCertainty(text: string): GradeMapResult | null {
  const normalized = text.toLowerCase();

  if (/\b(meta-analysis|systematic review|well-established|scientific consensus|strong consensus)\b/.test(normalized)) {
    return { certainty: 'high', scheme: 'general-science' };
  }
  // Checked before the bare "replicated" (moderate) pattern below, since both of
  // these phrases contain "replicated" as a substring and would otherwise be
  // misread as the positive, unqualified case.
  if (/\b(disputed|controversial|contested|not replicated|failed to replicate|inconclusive)\b/.test(normalized)) {
    return { certainty: 'very_low', scheme: 'general-science' };
  }
  if (/\b(preliminary|single study|emerging evidence|not yet replicated|small sample)\b/.test(normalized)) {
    return { certainty: 'low', scheme: 'general-science' };
  }
  if (/\b(widely accepted|replicated|independently confirmed|consistent (?:findings|results))\b/.test(normalized)) {
    return { certainty: 'moderate', scheme: 'general-science' };
  }

  return null;
}

const SCHEME_MAPPERS = [mapGeneralScienceCertainty];

/** Tries each known scheme in turn; the first match wins. `null` means no recognized scheme — caller keeps `nativeGrade` and falls back to `ungraded`. */
export function mapNativeGrade(nativeGrade: string): GradeMapResult | null {
  for (const mapper of SCHEME_MAPPERS) {
    const result = mapper(nativeGrade);
    if (result) return result;
  }
  return null;
}
