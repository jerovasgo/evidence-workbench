import { describe, expect, it, vi } from 'vitest';
import type { EuropePmcClient, PubmedClient } from '@/modules/02-retrieval';
import type { MetaClient, RespondResult } from '@/shared/meta';
import { createInMemoryBudgetGuard } from '@/shared/security';
import { runRetrievalPipeline } from './run-retrieval';

function fakeRespondResult(parsed: unknown): RespondResult {
  return {
    id: 'resp_x',
    text: JSON.stringify(parsed),
    parsed,
    webSearchResults: [],
    usage: { inputTokens: 10, cachedInputTokens: 0, outputTokens: 10, totalTokens: 20 },
    costUsd: 0.001,
    raw: {},
  };
}

function fakePubmed(overrides: Partial<PubmedClient> = {}): PubmedClient {
  return { search: vi.fn().mockResolvedValue({ pmids: [] }), fetchSummaries: vi.fn().mockResolvedValue([]), ...overrides };
}

function fakeEuropePmc(overrides: Partial<EuropePmcClient> = {}): EuropePmcClient {
  return { search: vi.fn().mockResolvedValue([]), fetchFullText: vi.fn().mockResolvedValue(null), ...overrides };
}

function baseDeps(metaClient: MetaClient, overrides: Partial<Parameters<typeof runRetrievalPipeline>[1]> = {}) {
  return {
    metaClient,
    budgetGuard: createInMemoryBudgetGuard({ runCostCapUsd: 1, dailyBudgetUsd: 20 }),
    p0Preamble: 'P0',
    p2PromptTemplate: 'Structure: {{free_text}} / {{condition}} / {{setting}}',
    p3PromptTemplate: 'Plan for {{condition}} / {{sub_questions}} / {{setting}} / {{country}}',
    p4PromptTemplate: 'Classify: {{sources_json}}',
    pubmed: fakePubmed(),
    europePmc: fakeEuropePmc(),
    ...overrides,
  };
}

const STRUCTURE_OUTPUT = {
  setting: 'emergency' as const,
  subQuestions: ['first-line treatment'],
  genericParameters: {},
};
const PLAN_OUTPUT = { queries: [{ family: 'pubmed' as const, text: 'acs', purpose: 'first-line treatment' }] };
const CLASSIFY_OUTPUT = {
  classifications: [{ sourceId: 'pubmed:111', kind: 'rct' as const, isScientific: true, confidence: 'high' as const }],
};

describe('runRetrievalPipeline', () => {
  it('runs structure -> plan -> retrieve -> classify end to end and applies the PubMed type override', async () => {
    const respond = vi
      .fn()
      .mockResolvedValueOnce(fakeRespondResult(STRUCTURE_OUTPUT))
      .mockResolvedValueOnce(fakeRespondResult(PLAN_OUTPUT))
      .mockResolvedValueOnce(fakeRespondResult(CLASSIFY_OUTPUT));
    const metaClient: MetaClient = { respond, listModels: vi.fn() };
    const pubmed = fakePubmed({
      search: vi.fn().mockResolvedValue({ pmids: ['111'] }),
      fetchSummaries: vi.fn().mockResolvedValue([
        { pmid: '111', title: 'A trial', pubTypes: ['Practice Guideline'] },
      ]),
    });

    const result = await runRetrievalPipeline(
      { runId: 'run_1', freeText: 'adult with chest pain', routerCondition: 'suspected ACS' },
      baseDeps(metaClient, { pubmed }),
    );

    expect(result.structure.status).toBe('ok');
    expect(result.plan.status).toBe('ok');
    expect(result.retrieval.status).toBe('ok');
    expect(result.retrieval.value).toHaveLength(1);
    expect(result.classification.status).toBe('ok');
    // The model classified sourceId pubmed:111 as 'rct', but its PubMed type is
    // "Practice Guideline" — the deterministic override must win.
    expect(result.classification.value?.[0]).toMatchObject({ sourceId: 'pubmed:111', kind: 'guideline' });
  });

  it('falls back to the router condition for planning when structure fails', async () => {
    // Structure's output is invalid on both the first attempt and the repair retry
    // (runAgent's harness), so it takes 2 calls before abstaining; plan's call is the 3rd.
    const respond = vi
      .fn()
      .mockResolvedValueOnce(fakeRespondResult({ setting: 'bogus' }))
      .mockResolvedValueOnce(fakeRespondResult({ setting: 'bogus' }))
      .mockResolvedValueOnce(fakeRespondResult({ queries: [] }));
    const metaClient: MetaClient = { respond, listModels: vi.fn() };

    const result = await runRetrievalPipeline(
      { runId: 'run_1', freeText: 'x', routerCondition: 'suspected ACS' },
      baseDeps(metaClient),
    );

    expect(result.structure.status).toBe('failed');
    const planPrompt = (respond.mock.calls[2]?.[0] as { input: { content: string }[] }).input[1]?.content;
    expect(planPrompt).toContain('suspected ACS');
    expect(result.plan.status).toBe('ok');
  });

  it('abstains classification and fails retrieval when the plan stage fails', async () => {
    const tooManyQueries = {
      queries: Array.from({ length: 13 }, (_, i) => ({ family: 'pubmed' as const, text: `q${i}`, purpose: `p${i}` })),
    };
    const respond = vi
      .fn()
      .mockResolvedValueOnce(fakeRespondResult(STRUCTURE_OUTPUT))
      .mockResolvedValueOnce(fakeRespondResult(tooManyQueries))
      .mockResolvedValueOnce(fakeRespondResult(tooManyQueries));
    const metaClient: MetaClient = { respond, listModels: vi.fn() };

    const result = await runRetrievalPipeline({ runId: 'run_1', freeText: 'x' }, baseDeps(metaClient));

    expect(result.plan.status).toBe('failed');
    expect(result.retrieval.status).toBe('failed');
    expect(result.classification.status).toBe('abstain');
  });

  it('keeps retrieved candidates even when classification fails', async () => {
    const respond = vi
      .fn()
      .mockResolvedValueOnce(fakeRespondResult(STRUCTURE_OUTPUT))
      .mockResolvedValueOnce(fakeRespondResult(PLAN_OUTPUT))
      .mockResolvedValueOnce(fakeRespondResult({ classifications: 'not-an-array' }))
      .mockResolvedValueOnce(fakeRespondResult({ classifications: 'still-not-an-array' }));
    const metaClient: MetaClient = { respond, listModels: vi.fn() };
    const pubmed = fakePubmed({
      search: vi.fn().mockResolvedValue({ pmids: ['111'] }),
      fetchSummaries: vi.fn().mockResolvedValue([{ pmid: '111', title: 'A trial', pubTypes: [] }]),
    });

    const result = await runRetrievalPipeline({ runId: 'run_1', freeText: 'x' }, baseDeps(metaClient, { pubmed }));

    expect(result.retrieval.status).toBe('ok');
    expect(result.retrieval.value).toHaveLength(1);
    expect(result.classification.status).toBe('failed');
  });
});
