import { describe, expect, it, vi } from 'vitest';
import type { MetaClient, RespondResult } from '@/shared/meta';
import { createInMemoryBudgetGuard } from '@/shared/security';
import { planSearch } from './search-planner';

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

function baseDeps(metaClient: MetaClient) {
  return {
    metaClient,
    budgetGuard: createInMemoryBudgetGuard({ runCostCapUsd: 0.4, dailyBudgetUsd: 20 }),
    p0Preamble: 'P0 preamble',
    p3PromptTemplate: 'Plan for {{condition}} / {{sub_questions}} / {{setting}} / {{country}}',
  };
}

describe('planSearch', () => {
  it('returns a valid SearchPlan on a well-formed model response', async () => {
    const plan = {
      queries: [
        { family: 'pubmed' as const, text: 'CRISPR Cas9 genome editing', purpose: 'genome editing evidence' },
        { family: 'europe_pmc' as const, text: 'Jinek 2012 CRISPR Cas9', purpose: 'named study' },
      ],
    };
    const respond = vi.fn().mockResolvedValue(fakeRespondResult(plan));
    const metaClient: MetaClient = { respond, listModels: vi.fn() };

    const result = await planSearch('run_1', { condition: 'CRISPR-Cas9 genome editing' }, baseDeps(metaClient));

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toEqual(plan);
  });

  it('substitutes condition/sub-questions/setting/country into the prompt template', async () => {
    const respond = vi.fn().mockResolvedValue(fakeRespondResult({ queries: [] }));
    const metaClient: MetaClient = { respond, listModels: vi.fn() };

    await planSearch(
      'run_1',
      { condition: 'suspected ACS', subQuestions: ['first-line treatment'], setting: 'emergency', country: 'CO' },
      baseDeps(metaClient),
    );

    const sentPrompt = (respond.mock.calls[0]?.[0] as { input: { content: string }[] }).input[1]?.content;
    expect(sentPrompt).toContain('suspected ACS');
    expect(sentPrompt).toContain('first-line treatment');
    expect(sentPrompt).toContain('emergency');
    expect(sentPrompt).toContain('CO');
  });

  it('abstains with reason invalid when the model exceeds the 12-query cap', async () => {
    const tooMany = {
      queries: Array.from({ length: 13 }, (_, i) => ({ family: 'pubmed' as const, text: `q${i}`, purpose: `p${i}` })),
    };
    const respond = vi.fn().mockResolvedValue(fakeRespondResult(tooMany));
    const metaClient: MetaClient = { respond, listModels: vi.fn() };

    const result = await planSearch('run_1', { condition: 'x' }, baseDeps(metaClient));
    expect(result).toEqual({ ok: false, reason: 'invalid', detail: expect.any(String) });
  });
});
