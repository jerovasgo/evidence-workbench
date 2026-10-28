import type { Grade } from '@/shared/domain';
import { mapNativeGrade } from '../scoring/grade-maps';

// Module 04 (docs/architecture/04-grading-and-scoring.md), principle 1 ("import
// before estimate") and principle 2 ("otherwise ungraded" — no `grade-estimator`
// agent is built yet, so there is nothing to estimate with; see that doc's own
// "Build notes": mapping+score first, estimator optional/gated).

/**
 * Builds a claim's `Grade` from whatever `nativeGrade` text the claim-extractor
 * (P5) captured, if any:
 * - No `nativeGrade` at all -> `ungraded` / `ai_estimated` (the honest placeholder
 *   for "nothing printed, nothing estimated" — unchanged from module 03's prior
 *   default; `origin` has no third "none" option in `GradeSchema`).
 * - `nativeGrade` present and a known scheme recognizes it -> the mapped
 *   `certainty`/`strength`, `origin: 'source'` (principle 1: copied verbatim, not
 *   estimated).
 * - `nativeGrade` present but no scheme recognizes it -> keep the raw text,
 *   `certainty: 'ungraded'`, `origin: 'source'` still (the text did come from the
 *   source, it just doesn't map to this project's scale) — architecture doc's own
 *   failure mode: "Source uses unfamiliar scheme -> Keep native text; ungraded; no
 *   estimation".
 */
export function gradeClaim(nativeGrade?: string): Grade {
  if (!nativeGrade) {
    return { certainty: 'ungraded', origin: 'ai_estimated' };
  }

  const mapped = mapNativeGrade(nativeGrade);
  if (!mapped) {
    return { certainty: 'ungraded', origin: 'source', nativeGrade };
  }

  return { certainty: mapped.certainty, strength: mapped.strength, origin: 'source', nativeGrade };
}
