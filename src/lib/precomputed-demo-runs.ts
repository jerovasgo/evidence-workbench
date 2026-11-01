import type { Intent } from '@/modules/01-orchestrator';

// 2026-11-01 (docs/DECISIONS.md): a narrow, hackathon-scoped slice of "caching" —
// not a general cache/precompute layer. This is a static snapshot, captured once by
// manually running `node scripts/precompute-demo-runs.mjs` against the local dev
// server, then pasting its output here. There is no automatic refresh and no
// invalidation: if a landing-page suggestion's text changes
// (`src/components/dashboard/empty-state.tsx`'s `SUGGESTIONS`), the corresponding
// entry below silently stops matching and that suggestion just falls back to a
// normal live run — never a stale "verified" answer shown as current (CLAUDE.md rule
// 5), just a slower one.
//
// Every run is publicly viewable by id today regardless of who created it
// (`getRunForViewer`, `src/modules/01-orchestrator/pipeline/create-run.ts`: every run
// is anonymous — `isPrecomputed = userId === null` — and `isPrecomputed` alone grants
// view access), so these runIds work for any visitor once deployed; no new
// permission logic was needed for this.
export const PRECOMPUTED_DEMO_RUNS: Record<string, { runId: string; intent: Intent }> = {
  'Does a polar aprotic solvent increase the rate of an SN2 reaction?': { runId: '8ca2991c-142a-48f1-865d-759a88105474', intent: 'fact_lookup' },
  'Compare the evidence for CRISPR-Cas9 off-target rates at different guide RNA lengths.': { runId: '3539c6ca-44cf-4488-a8f1-1bd0ca560fb3', intent: 'comparison' },
  'What does recent evidence say about horizontal gene transfer in antibiotic resistance?': { runId: 'a7e5e9c5-f74b-4b03-91cc-7034f2df2154', intent: 'fact_lookup' },
};
