// Shared kernel: the tool registry *mechanism* (allow-lists, capability
// minimisation). Real tool implementations (PubMed, Crossref, ...) are owned by the
// module that provides them (module 02's register-retrieval-tools.ts, etc.) and are
// registered into an instance of this registry — they do not live here.
export * from './registry';
