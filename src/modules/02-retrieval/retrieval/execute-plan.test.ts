import { describe, expect, it, vi } from 'vitest';
import type { MetaClient, RespondResult } from '@/shared/meta';
import { createInMemoryBudgetGuard } from '@/shared/security';
import type { EuropePmcClient } from '../tools/europe-pmc';
import type { PubmedClient } from '../tools/pubmed';
import type { SearchPlan } from '../schemas/retrieval';
import { executeSearchPlan } from './execute-plan';

function fakeRespondResult(webSearchResults: RespondResult['webSearchResults']): RespondResult {
  return {
    id: 'resp_x',
    text: null,
    parsed: null,
    webSearchResults,
    usage: { inputTokens: 10, cachedInputTokens: 0, outputTokens: 10, totalTokens: 20 },
    costUsd: 0.01,
    raw: {},
  };
}

function fakeHttpFetch(body: string): typeof fetch {
  return vi.fn().mockResolvedValue(
    new Response(body, { status: 200, headers: { 'Content-Type': 'text/html' } }),
  ) as unknown as typeof fetch;
}

function fakePubmed(overrides: Partial<PubmedClient> = {}): PubmedClient {
  return {
    search: vi.fn().mockResolvedValue({ pmids: [] }),
    fetchSummaries: vi.fn().mockResolvedValue([]),
    ...overrides,
  };
}

function fakeEuropePmc(overrides: Partial<EuropePmcClient> = {}): EuropePmcClient {
  return {
    search: vi.fn().mockResolvedValue([]),
    fetchFullText: vi.fn().mockResolvedValue(null),
    ...overrides,
  };
}

describe('executeSearchPlan', () => {
  it('maps pubmed search+summaries into CandidateSource[]', async () => {
    const pubmed = fakePubmed({
      search: vi.fn().mockResolvedValue({ pmids: ['111'] }),
      fetchSummaries: vi.fn().mockResolvedValue([
        { pmid: '111', title: 'A guideline', journal: 'NEJM', pubDate: '2023 Jan', pubTypes: [], doi: '10.1/x' },
      ]),
    });
    const plan: SearchPlan = { queries: [{ family: 'pubmed', text: 'acs', purpose: 'first-line' }] };

    const result = await executeSearchPlan(plan, { pubmed, europePmc: fakeEuropePmc() });

    expect(result.candidates).toEqual([
      {
        tempId: 'pubmed:111',
        family: 'pubmed',
        title: 'A guideline',
        issuer: 'NEJM',
        year: 2023,
        doi: '10.1/x',
        pmid: '111',
        url: 'https://pubmed.ncbi.nlm.nih.gov/111/',
      },
    ]);
    expect(result.skipped).toEqual([]);
    expect(result.failed).toEqual([]);
  });

  it('carries PubMed publication types through to the candidate', async () => {
    const pubmed = fakePubmed({
      search: vi.fn().mockResolvedValue({ pmids: ['222'] }),
      fetchSummaries: vi.fn().mockResolvedValue([
        { pmid: '222', title: 'A guideline', pubTypes: ['Practice Guideline', 'Journal Article'] },
      ]),
    });
    const plan: SearchPlan = { queries: [{ family: 'pubmed', text: 'acs', purpose: 'first-line' }] };

    const result = await executeSearchPlan(plan, { pubmed, europePmc: fakeEuropePmc() });

    expect(result.candidates[0]?.pubTypes).toEqual(['Practice Guideline', 'Journal Article']);
  });

  it('maps europe_pmc results into CandidateSource[]', async () => {
    const europePmc = fakeEuropePmc({
      search: vi.fn().mockResolvedValue([
        { id: 'PMC1', source: 'PMC', doi: '10.1/y', title: 'A trial', isOpenAccess: true, pubTypes: [], pubYear: 2022 },
      ]),
    });
    const plan: SearchPlan = { queries: [{ family: 'europe_pmc', text: 'acs trial', purpose: 'rct' }] };

    const result = await executeSearchPlan(plan, { pubmed: fakePubmed(), europePmc });

    expect(result.candidates).toEqual([
      {
        tempId: 'europe_pmc:PMC:PMC1',
        family: 'europe_pmc',
        title: 'A trial',
        year: 2022,
        doi: '10.1/y',
        url: 'https://europepmc.org/article/PMC/PMC1',
        isOpenAccess: true,
      },
    ]);
  });

  it('skips web/guideline/local queries without calling any connector', async () => {
    const pubmed = fakePubmed();
    const europePmc = fakeEuropePmc();
    const plan: SearchPlan = {
      queries: [
        { family: 'web', text: 'controversy', purpose: 'adversarial' },
        { family: 'standards_body', text: 'IUPAC nomenclature', purpose: 'standards body publication' },
        { family: 'local', text: 'local protocol', purpose: 'local pool' },
      ],
    };

    const result = await executeSearchPlan(plan, { pubmed, europePmc });

    expect(result.candidates).toEqual([]);
    expect(result.skipped).toHaveLength(3);
    expect(result.skipped[0]?.reason).toContain('web');
    expect(pubmed.search).not.toHaveBeenCalled();
    expect(europePmc.search).not.toHaveBeenCalled();
  });

  it('records a connector failure without aborting the other queries', async () => {
    const pubmed = fakePubmed({ search: vi.fn().mockRejectedValue(new Error('PubMed esearch failed: HTTP 500')) });
    const europePmc = fakeEuropePmc({
      search: vi.fn().mockResolvedValue([
        { id: 'PMC2', source: 'PMC', title: 'Still works', isOpenAccess: false, pubTypes: [] },
      ]),
    });
    const plan: SearchPlan = {
      queries: [
        { family: 'pubmed', text: 'acs', purpose: 'first-line' },
        { family: 'europe_pmc', text: 'acs', purpose: 'first-line' },
      ],
    };

    const result = await executeSearchPlan(plan, { pubmed, europePmc });

    expect(result.failed).toEqual([
      { query: plan.queries[0], error: 'PubMed esearch failed: HTTP 500' },
    ]);
    expect(result.candidates).toHaveLength(1);
  });

  it('never runs more than maxConcurrency queries at once', async () => {
    let inFlight = 0;
    let maxObserved = 0;
    const pubmed = fakePubmed({
      search: vi.fn().mockImplementation(async () => {
        inFlight++;
        maxObserved = Math.max(maxObserved, inFlight);
        await new Promise((resolve) => setTimeout(resolve, 10));
        inFlight--;
        return { pmids: [] };
      }),
    });
    const plan: SearchPlan = {
      queries: Array.from({ length: 6 }, (_, i) => ({ family: 'pubmed' as const, text: `q${i}`, purpose: `p${i}` })),
    };

    await executeSearchPlan(plan, { pubmed, europePmc: fakeEuropePmc(), maxConcurrency: 2 });

    expect(maxObserved).toBeLessThanOrEqual(2);
  });

  it('returns empty results for an empty plan', async () => {
    const result = await executeSearchPlan({ queries: [] }, { pubmed: fakePubmed(), europePmc: fakeEuropePmc() });
    expect(result).toEqual({ candidates: [], skipped: [], failed: [] });
  });

  describe('webSearch (web/standards_body families)', () => {
    it('runs a web/standards_body query via web_search + fetch_url_text when webSearch deps are provided', async () => {
      const respond = vi.fn().mockResolvedValue(
        fakeRespondResult([{ title: 'IUPAC guidance', url: 'https://iupac.org/nomenclature', snippet: 'x' }]),
      );
      const metaClient: MetaClient = { respond, listModels: vi.fn() };
      const plan: SearchPlan = { queries: [{ family: 'standards_body', text: 'IUPAC nomenclature', purpose: 'standards body publication' }] };

      const result = await executeSearchPlan(plan, {
        pubmed: fakePubmed(),
        europePmc: fakeEuropePmc(),
        webSearch: {
          runId: 'run_1',
          metaClient,
          budgetGuard: createInMemoryBudgetGuard({ runCostCapUsd: 1, dailyBudgetUsd: 10 }),
          allowedDomains: ['iupac.org'],
          fetchImpl: fakeHttpFetch('<html><body><p>Real page text</p></body></html>'),
        },
      });

      expect(result.skipped).toEqual([]);
      expect(result.candidates).toHaveLength(1);
      expect(result.candidates[0]).toMatchObject({ family: 'standards_body', title: 'IUPAC guidance', url: 'https://iupac.org/nomenclature' });
    });

    it('discards a web_search result whose URL is not on the allow-list', async () => {
      const respond = vi.fn().mockResolvedValue(
        fakeRespondResult([{ title: 'Random blog', url: 'https://some-random-blog.example.com/x', snippet: 'x' }]),
      );
      const metaClient: MetaClient = { respond, listModels: vi.fn() };
      const plan: SearchPlan = { queries: [{ family: 'web', text: 'adversarial query', purpose: 'adversarial' }] };

      const result = await executeSearchPlan(plan, {
        pubmed: fakePubmed(),
        europePmc: fakeEuropePmc(),
        webSearch: {
          runId: 'run_1',
          metaClient,
          budgetGuard: createInMemoryBudgetGuard({ runCostCapUsd: 1, dailyBudgetUsd: 10 }),
          allowedDomains: ['cdc.gov'],
          fetchImpl: fakeHttpFetch('<html></html>'),
        },
      });

      expect(result.candidates).toEqual([]);
      expect(result.failed).toEqual([]);
    });

    it('still skips web/guideline queries when webSearch deps are not provided', async () => {
      const plan: SearchPlan = { queries: [{ family: 'web', text: 'x', purpose: 'p' }] };
      const result = await executeSearchPlan(plan, { pubmed: fakePubmed(), europePmc: fakeEuropePmc() });
      expect(result.skipped).toHaveLength(1);
      expect(result.candidates).toEqual([]);
    });
  });
});

it('interleaves index ranks so one connector cannot starve the other', async () => {
  const result = await executeSearchPlan({ queries: [
    { family: 'pubmed', text: 'hypoxia', purpose: 'research' },
    { family: 'europe_pmc', text: 'hypoxia', purpose: 'research' },
  ] }, {
    pubmed: fakePubmed({ search: vi.fn().mockResolvedValue({ pmids: ['1', '2'] }), fetchSummaries: vi.fn().mockResolvedValue([{ pmid: '1', title: 'First', pubTypes: [] }, { pmid: '2', title: 'Second', pubTypes: [] }]) }),
    europePmc: fakeEuropePmc({ search: vi.fn().mockResolvedValue([{ id: 'PMC3', source: 'PMC', title: 'Open', isOpenAccess: true, pubTypes: [] }]) }),
  });
  expect(result.candidates.map((item) => item.tempId)).toEqual(['pubmed:1', 'europe_pmc:PMC:PMC3', 'pubmed:2']);
});
