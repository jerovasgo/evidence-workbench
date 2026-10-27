import { describe, expect, it, vi } from 'vitest';
import type { CrossrefClient } from './crossref';
import type { EuropePmcClient } from './europe-pmc';
import type { PubmedClient } from './pubmed';
import { registerRetrievalTools } from './register-retrieval-tools';
import { createToolRegistry, TOOL_NAMES } from './registry';

function fakeDeps() {
  const pubmed: PubmedClient = {
    search: vi.fn(async () => ({ pmids: ['1', '2'] })),
    fetchSummaries: vi.fn(async () => [{ pmid: '1', title: 'x', pubTypes: [] }]),
  };
  const europePmc: EuropePmcClient = {
    search: vi.fn(async () => [{ id: '1', source: 'MED', title: 'x', isOpenAccess: true, pubTypes: [] }]),
    fetchFullText: vi.fn(async () => 'full text'),
  };
  const crossref: CrossrefClient = {
    lookup: vi.fn(async () => ({ doi: '10.1/x', retracted: false, updateNotices: [] })),
  };
  return { pubmed, europePmc, crossref, allowedFetchDomains: ['guidelines.example.org'] };
}

describe('registerRetrievalTools', () => {
  it('registers pubmed_search delegating to the pubmed client', async () => {
    const registry = createToolRegistry();
    const deps = fakeDeps();
    registerRetrievalTools(registry, deps);

    const tool = registry.getForAgent('pubmed_search', TOOL_NAMES);
    const result = await tool.run({ query: 'chest pain', retmax: 5 });
    expect(deps.pubmed.search).toHaveBeenCalledWith('chest pain', { retmax: 5 });
    expect(result).toEqual({ pmids: ['1', '2'] });
  });

  it('registers pubmed_fetch wrapping fetchSummaries in a {summaries} envelope', async () => {
    const registry = createToolRegistry();
    const deps = fakeDeps();
    registerRetrievalTools(registry, deps);

    const tool = registry.getForAgent('pubmed_fetch', TOOL_NAMES);
    const result = await tool.run({ pmids: ['1'] });
    expect(result).toEqual({ summaries: [{ pmid: '1', title: 'x', pubTypes: [] }] });
  });

  it('registers europe_pmc_search wrapping search results in a {results} envelope', async () => {
    const registry = createToolRegistry();
    const deps = fakeDeps();
    registerRetrievalTools(registry, deps);

    const tool = registry.getForAgent('europe_pmc_search', TOOL_NAMES);
    const result = await tool.run({ query: 'x' });
    expect(deps.europePmc.search).toHaveBeenCalledWith('x', { pageSize: undefined });
    expect(result).toEqual({ results: [{ id: '1', source: 'MED', title: 'x', isOpenAccess: true, pubTypes: [] }] });
  });

  it('registers europe_pmc_fulltext wrapping the text (or null) in a {text} envelope', async () => {
    const registry = createToolRegistry();
    const deps = fakeDeps();
    registerRetrievalTools(registry, deps);

    const tool = registry.getForAgent('europe_pmc_fulltext', TOOL_NAMES);
    const result = await tool.run({ source: 'MED', id: '1' });
    expect(deps.europePmc.fetchFullText).toHaveBeenCalledWith('MED', '1');
    expect(result).toEqual({ text: 'full text' });
  });

  it('registers crossref_lookup wrapping the work (or null) in a {work} envelope', async () => {
    const registry = createToolRegistry();
    const deps = fakeDeps();
    registerRetrievalTools(registry, deps);

    const tool = registry.getForAgent('crossref_lookup', TOOL_NAMES);
    const result = await tool.run({ doi: '10.1/x' });
    expect(result).toEqual({ work: { doi: '10.1/x', retracted: false, updateNotices: [] } });
  });

  it('registers fetch_url_text using the configured allow-list', async () => {
    const registry = createToolRegistry();
    const deps = fakeDeps();
    registerRetrievalTools(registry, deps);

    const tool = registry.getForAgent('fetch_url_text', TOOL_NAMES);
    await expect(tool.run({ url: 'https://evil.example.com/x' })).rejects.toThrow(/not on the allow-list/);
  });
});
