// Module 06 public API (docs/architecture/06-algorithm-generator.md). This is the
// ONLY path other modules or the app layer may import from this module through —
// never `@/modules/06-algorithm/pipeline/synthesize-algorithm` etc. directly.
export * from './schemas/algorithm';
export * from './schemas/algorithm-synthesizer';
export * from './validators/algorithm';
export * from './agents/algorithm-synthesizer';
export * from './pipeline/synthesize-algorithm';
export * from './pipeline/flatten-algorithm';
export * from './pipeline/layout-algorithm';
