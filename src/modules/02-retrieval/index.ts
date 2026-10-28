// Module 02 public API (docs/architecture/02-retrieval.md). html-text.ts,
// ttl-cache.ts and rate-limiter.ts are internal utilities used by this module's own
// connectors and are intentionally not exported here.
export * from './schemas/retrieval';
export * from './schemas/tool-io';

export * from './tools/pubmed';
export * from './tools/europe-pmc';
export * from './tools/crossref';
export * from './tools/fetch-url-text';
export * from './tools/register-retrieval-tools';

// normalizeDoi already comes from tools/crossref above; re-exporting it a second time
// from here (where normalize-identifiers.ts also re-exports it) would be a duplicate
// export, so only its two module-02-specific siblings are named explicitly.
export { normalizeUrl, normalizePmid } from './curation/normalize-identifiers';
export * from './curation/deduplicate';
export * from './curation/version-resolution';
export * from './curation/diversity-selection';
export * from './curation/coverage-report';

export * from './scoring/config';
export * from './scoring/score';

export * from './schemas/classification';
export * from './classification/pubmed-type-override';
export * from './agents/search-planner';
export * from './agents/source-classifier';
export * from './retrieval/execute-plan';
export * from './retrieval/fetch-full-text';
export * from './retrieval/default-allowed-domains';
export * from './agents/web-source-finder';
