// Module 05 public API (docs/architecture/05-governance-local-vs-external.md).
// This slice is `relation-labeller` only (T1, cross-source, no local protocol
// needed) — the governance table, divergence-analyst and local-document upload
// are not built yet (docs/DECISIONS.md).
export * from './schemas/relation-labeller';
export * from './pipeline/pair-claims';
export * from './agents/relation-labeller';
export * from './agents/label-relations-batched';
