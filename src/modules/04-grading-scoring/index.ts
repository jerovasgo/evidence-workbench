// Module 04 public API (docs/architecture/04-grading-and-scoring.md). Part A only
// (grading): deterministic grade-maps + gradeClaim. Source-score wiring (quality/
// applicability/ScoreBreakdown) and the grade-estimator agent (P6) are not built in
// this pass — see docs/DECISIONS.md.
export * from './scoring/grade-maps';
export * from './pipeline/grade-claim';
