import {
  CrossrefLookupInputSchema,
  CrossrefLookupOutputSchema,
  EuropePmcFullTextInputSchema,
  EuropePmcFullTextOutputSchema,
  EuropePmcSearchInputSchema,
  EuropePmcSearchOutputSchema,
  FetchUrlTextInputSchema,
  FetchUrlTextOutputSchema,
  PubmedFetchInputSchema,
  PubmedFetchOutputSchema,
  PubmedSearchInputSchema,
  PubmedSearchOutputSchema,
} from '../schemas/tool-io';
import type { CrossrefClient } from './crossref';
import type { EuropePmcClient } from './europe-pmc';
import { fetchUrlText } from './fetch-url-text';
import type { PubmedClient } from './pubmed';
import type { ToolRegistry } from './registry';

// Wires the real module 02 connectors into the tool registry, replacing the stubs
// registerStubTools put there for pubmed_search, pubmed_fetch, europe_pmc_search,
// europe_pmc_fulltext, crossref_lookup, and fetch_url_text. web_search (the Meta
// Model API's own tool, module 02) and local_search/uniprot_lookup/chebi_lookup/
// reactome_query/gtopdb_query (module 08) are not implemented here.

export interface RetrievalToolDeps {
  pubmed: PubmedClient;
  europePmc: EuropePmcClient;
  crossref: CrossrefClient;
  /** fetch_url_text's SSRF allow-list (module 10) — guideline/society domains only. */
  allowedFetchDomains: readonly string[];
}

export function registerRetrievalTools(registry: ToolRegistry, deps: RetrievalToolDeps): void {
  registry.register({
    name: 'pubmed_search',
    description: 'E-utilities search for guideline/SR/RCT records',
    inputSchema: PubmedSearchInputSchema,
    outputSchema: PubmedSearchOutputSchema,
    timeoutMs: 8000,
    rateLimitPerMinute: 60,
    run: async (input) => deps.pubmed.search(input.query, { retmax: input.retmax }),
  });

  registry.register({
    name: 'pubmed_fetch',
    description: 'E-utilities record fetch by PMID',
    inputSchema: PubmedFetchInputSchema,
    outputSchema: PubmedFetchOutputSchema,
    timeoutMs: 8000,
    rateLimitPerMinute: 60,
    run: async (input) => ({ summaries: await deps.pubmed.fetchSummaries(input.pmids) }),
  });

  registry.register({
    name: 'europe_pmc_search',
    description: 'Open full-text search',
    inputSchema: EuropePmcSearchInputSchema,
    outputSchema: EuropePmcSearchOutputSchema,
    timeoutMs: 8000,
    rateLimitPerMinute: 60,
    run: async (input) => ({ results: await deps.europePmc.search(input.query, { pageSize: input.pageSize }) }),
  });

  registry.register({
    name: 'europe_pmc_fulltext',
    description: 'Open full-text article fetch',
    inputSchema: EuropePmcFullTextInputSchema,
    outputSchema: EuropePmcFullTextOutputSchema,
    timeoutMs: 10000,
    rateLimitPerMinute: 60,
    run: async (input) => ({ text: await deps.europePmc.fetchFullText(input.source, input.id) }),
  });

  registry.register({
    name: 'crossref_lookup',
    description: 'DOI existence, metadata, retraction notices',
    inputSchema: CrossrefLookupInputSchema,
    outputSchema: CrossrefLookupOutputSchema,
    timeoutMs: 6000,
    rateLimitPerMinute: 60,
    run: async (input) => ({ work: await deps.crossref.lookup(input.doi) }),
  });

  registry.register({
    name: 'fetch_url_text',
    description: 'Fetch and extract readable text from an allow-listed domain',
    inputSchema: FetchUrlTextInputSchema,
    outputSchema: FetchUrlTextOutputSchema,
    timeoutMs: 10000,
    rateLimitPerMinute: 30,
    run: async (input) => fetchUrlText(input.url, { allowedDomains: deps.allowedFetchDomains }),
  });
}
