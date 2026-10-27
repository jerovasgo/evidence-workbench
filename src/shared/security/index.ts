// Shared kernel: module 10 is explicitly cross-cutting ("Implemented as middleware,
// database policies, and wrappers used by all modules") — its content lives here, not
// in a modules/10-* folder, because no single module owns it.
export * from './encryption';
export * from './budget-guard';
export * from './url-guard';
