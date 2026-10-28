import { describe, expect, it, vi } from 'vitest';
import type { MetaClient, RespondResult } from '@/shared/meta';
import { createInMemoryBudgetGuard } from '@/shared/security';
import { findWebSources } from './web-source-finder';

function fakeRespondResult(webSearchResults: RespondResult['webSearchResults'], costUsd = 0.01): RespondResult {
  return {
    id: 'resp_x',
    text: null,
    parsed: null,
    webSearchResults,
    usage: { inputTokens: 10, cachedInputTokens: 0, outputTokens: 10, totalTokens: 20 },
    costUsd,
    raw: {},
  };
}

describe('findWebSources', () => {
  it('returns the webSearchResults from a successful call', async () => {
    const results = [{ title: 'CDC ACS guidance', url: 'https://www.cdc.gov/acs', snippet: 'x' }];
    const respond = vi.fn().mockResolvedValue(fakeRespondResult(results));
    const metaClient: MetaClient = { respond, listModels: vi.fn() };
    const budgetGuard = createInMemoryBudgetGuard({ runCostCapUsd: 1, dailyBudgetUsd: 10 });

    const result = await findWebSources('run_1', { query: 'ACS guideline', preferredDomains: ['cdc.gov'] }, { metaClient, budgetGuard });

    expect(result).toEqual({ ok: true, results });
    expect(respond).toHaveBeenCalledWith(
      expect.objectContaining({ tools: ['web_search'], includeWebSearchResults: true }),
    );
  });

  it('records the real cost against the budget guard after a successful call', async () => {
    const respond = vi.fn().mockResolvedValue(fakeRespondResult([], 0.02));
    const metaClient: MetaClient = { respond, listModels: vi.fn() };
    const budgetGuard = createInMemoryBudgetGuard({ runCostCapUsd: 1, dailyBudgetUsd: 10 });

    await findWebSources('run_1', { query: 'x', preferredDomains: [] }, { metaClient, budgetGuard });

    expect(budgetGuard.spentForRun('run_1')).toBeCloseTo(0.02);
  });

  it('refuses to call the model once the run cost cap is already exhausted', async () => {
    const respond = vi.fn();
    const metaClient: MetaClient = { respond, listModels: vi.fn() };
    const budgetGuard = createInMemoryBudgetGuard({ runCostCapUsd: 0.01, dailyBudgetUsd: 10 });
    budgetGuard.record('run_1', 0.01);

    const result = await findWebSources('run_1', { query: 'x', preferredDomains: [] }, { metaClient, budgetGuard });

    expect(result).toEqual({ ok: false, reason: 'budget', detail: expect.any(String) });
    expect(respond).not.toHaveBeenCalled();
  });

  it('returns reason api_error when the client rejects', async () => {
    const respond = vi.fn().mockRejectedValue(new Error('network down'));
    const metaClient: MetaClient = { respond, listModels: vi.fn() };
    const budgetGuard = createInMemoryBudgetGuard({ runCostCapUsd: 1, dailyBudgetUsd: 10 });

    const result = await findWebSources('run_1', { query: 'x', preferredDomains: [] }, { metaClient, budgetGuard });

    expect(result).toEqual({ ok: false, reason: 'api_error', detail: 'network down' });
  });

  it('returns reason timeout when the call exceeds the timeout', async () => {
    const respond = vi.fn().mockImplementation(() => new Promise(() => {})); // never resolves
    const metaClient: MetaClient = { respond, listModels: vi.fn() };
    const budgetGuard = createInMemoryBudgetGuard({ runCostCapUsd: 1, dailyBudgetUsd: 10 });

    const result = await findWebSources('run_1', { query: 'x', preferredDomains: [] }, { metaClient, budgetGuard, timeoutMs: 10 });

    expect(result).toEqual({ ok: false, reason: 'timeout', detail: expect.any(String) });
  });
});
