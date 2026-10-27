// Shared kernel: SPEC §8 core entities referenced by three or more modules
// (Source/Passage by 02/03, Claim/Grade by 03/04/05/06, Relation by 05/07,
// Run/Receipt by 01 and every view module's output). Everything else in SPEC §8
// (AlgorithmGraph, MapNode/Matrix, MechanismGraph, JobSpec, RouterOutput) is owned by
// the one module that defines it and lives in that module's own schemas/ folder.
export * from './source';
export * from './claim';
export * from './relation';
export * from './run';
