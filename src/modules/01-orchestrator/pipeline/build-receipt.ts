import type { Receipt } from '@/shared/domain';
import type { RunRetrievalResult } from './run-retrieval';

// Module 01 `Receipt` (SPEC §8) — CLAUDE.md: never cut. Built from a finished
// `RunRetrievalResult`. Honest about what this slice can and can't know yet:
// - `supported`/`abstained` are 0: no `support-judge` agent (module 03, T2) exists,
//   so no claim can reach `support: 'supports'`, and no per-sub-question abstain
//   decision is made at this layer (that belongs to a view/synthesize stage, not
//   built). Logged in SECURITY.md, not silently assumed to be zero cost.
// - `retracted` counts dropped-claim reasons, not sources, since this slice tracks
//   claims, not a persisted `sources` table yet.

export function buildReceipt(result: RunRetrievalResult): Receipt {
  const claims = result.extraction.value ?? [];
  const counts = result.extraction.metrics.counts ?? {};

  const sourcesByKind: Record<string, number> = {};
  for (const classification of result.classification.value ?? []) {
    sourcesByKind[classification.kind] = (sourcesByKind[classification.kind] ?? 0) + 1;
  }

  const years = (result.classification.value ?? [])
    .map((c) => c.publicationYear)
    .filter((y): y is number => y !== undefined);

  return {
    claimsTotal: claims.length + (counts.claimsDropped ?? 0),
    citationsExist: claims.length,
    quotesFound: claims.length,
    retracted: counts.retracted ?? 0,
    supported: 0,
    abstained: 0,
    sourcesByKind,
    oldestSourceYear: years.length > 0 ? Math.min(...years) : undefined,
    generatedAt: new Date().toISOString(),
  };
}
