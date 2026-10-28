// Module 04 public API (docs/architecture/04-grading-and-scoring.md). Part A
// (grading): deterministic grade-maps + gradeClaim. Part B (source-score wiring):
// quality/applicability factors + buildSourceScore, reusing module 02's already-built
// level/currency math. The grade-estimator agent (P6, AI-estimated GRADE domains) is
// not built — see docs/DECISIONS.md.
export * from './scoring/grade-maps';
export * from './pipeline/grade-claim';
export * from './schemas/score-breakdown';
export * from './scoring/quality';
export * from './scoring/applicability';
export * from './scoring/source-score';
