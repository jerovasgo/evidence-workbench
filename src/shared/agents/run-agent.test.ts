import { z } from 'zod';
import { describe, expect, it, vi } from 'vitest';
import type { MetaClient, RespondResult } from '@/shared/meta';
import { createInMemoryBudgetGuard } from '@/shared/security';
import { runAgent } from './run-agent';

const SentimentSchema = z.object({ sentiment: z.enum(['positive', 'negative']) });

function fakeRespondResult(parsed: unknown, overrides: Partial<RespondResult> = {}): RespondResult {
  return {
    id: 'resp_x',
    text: JSON.stringify(parsed),
    parsed,
    webSearchResults: [],
    usage: { inputTokens: 10, cachedInputTokens: 0, outputTokens: 10, totalTokens: 20 },
    costUsd: 0.001,
    raw: {},
    ...overrides,
  };
}

function baseCtx(metaClient: MetaClient) {
  return {
    runId: 'run_1',
    metaClient,
    budgetGuard: createInMemoryBudgetGuard({ runCostCapUsd: 0.4, dailyBudgetUsd: 20 }),
  };
}

describe('runAgent', () => {
  it('returns ok:true when the first attempt already matches the schema', async () => {
    const respond = vi.fn().mockResolvedValue(fakeRespondResult({ sentiment: 'positive' }));
    const metaClient: MetaClient = { respond, listModels: vi.fn() };

    const result = await runAgent({
      name: 'sentiment-agent',
      promptVersion: 'P99@0.1',
      tier: 'T0',
      systemPreamble: 'P0 preamble',
      prompt: 'classify',
      outputSchema: SentimentSchema,
      limits: { maxOutputTokens: 100, timeoutMs: 1000, maxCostUsd: 0.1 },
      ctx: baseCtx(metaClient),
    });

    expect(result).toEqual({
      ok: true,
      value: { sentiment: 'positive' },
      usage: { tokens: 20, costUsd: 0.001, ms: expect.any(Number) },
    });
    expect(respond).toHaveBeenCalledTimes(1);
  });

  it('retries once with the validation error, then succeeds', async () => {
    const respond = vi
      .fn()
      .mockResolvedValueOnce(fakeRespondResult({ sentiment: 'maybe' })) // invalid
      .mockResolvedValueOnce(fakeRespondResult({ sentiment: 'positive' })); // repaired
    const metaClient: MetaClient = { respond, listModels: vi.fn() };

    const result = await runAgent({
      name: 'sentiment-agent',
      promptVersion: 'P99@0.1',
      tier: 'T0',
      systemPreamble: 'P0',
      prompt: 'classify',
      outputSchema: SentimentSchema,
      limits: { maxOutputTokens: 100, timeoutMs: 1000, maxCostUsd: 0.1 },
      ctx: baseCtx(metaClient),
    });

    expect(result.ok).toBe(true);
    expect(respond).toHaveBeenCalledTimes(2);
    const secondCallInput = respond.mock.calls[1]?.[0]?.input as { role: string; content: string }[];
    expect(secondCallInput.some((m) => m.content.includes('Validation errors'))).toBe(true);
  });

  it('abstains with reason invalid after the repair retry also fails', async () => {
    const respond = vi
      .fn()
      .mockResolvedValueOnce(fakeRespondResult({ sentiment: 'maybe' }))
      .mockResolvedValueOnce(fakeRespondResult({ sentiment: 'still-wrong' }));
    const metaClient: MetaClient = { respond, listModels: vi.fn() };

    const result = await runAgent({
      name: 'sentiment-agent',
      promptVersion: 'P99@0.1',
      tier: 'T0',
      systemPreamble: 'P0',
      prompt: 'classify',
      outputSchema: SentimentSchema,
      limits: { maxOutputTokens: 100, timeoutMs: 1000, maxCostUsd: 0.1 },
      ctx: baseCtx(metaClient),
    });

    expect(result).toEqual({ ok: false, reason: 'invalid', detail: expect.any(String) });
    expect(respond).toHaveBeenCalledTimes(2);
  });

  it('denies the call up front when the budget guard rejects it, without calling the model', async () => {
    const respond = vi.fn();
    const metaClient: MetaClient = { respond, listModels: vi.fn() };
    const budgetGuard = createInMemoryBudgetGuard({ runCostCapUsd: 0.05, dailyBudgetUsd: 20 });
    budgetGuard.record('run_1', 0.04);

    const result = await runAgent({
      name: 'sentiment-agent',
      promptVersion: 'P99@0.1',
      tier: 'T0',
      systemPreamble: 'P0',
      prompt: 'classify',
      outputSchema: SentimentSchema,
      limits: { maxOutputTokens: 100, timeoutMs: 1000, maxCostUsd: 0.1 },
      ctx: { runId: 'run_1', metaClient, budgetGuard },
    });

    expect(result).toEqual({ ok: false, reason: 'budget', detail: 'run_cap_exceeded' });
    expect(respond).not.toHaveBeenCalled();
  });

  it('records real cost on the budget guard after a successful call', async () => {
    const respond = vi.fn().mockResolvedValue(fakeRespondResult({ sentiment: 'positive' }, { costUsd: 0.02 }));
    const metaClient: MetaClient = { respond, listModels: vi.fn() };
    const budgetGuard = createInMemoryBudgetGuard({ runCostCapUsd: 0.4, dailyBudgetUsd: 20 });

    await runAgent({
      name: 'sentiment-agent',
      promptVersion: 'P99@0.1',
      tier: 'T0',
      systemPreamble: 'P0',
      prompt: 'classify',
      outputSchema: SentimentSchema,
      limits: { maxOutputTokens: 100, timeoutMs: 1000, maxCostUsd: 0.1 },
      ctx: { runId: 'run_1', metaClient, budgetGuard },
    });

    expect(budgetGuard.spentForRun('run_1')).toBeCloseTo(0.02, 6);
  });

  it('returns reason timeout when the call exceeds limits.timeoutMs', async () => {
    const respond = vi.fn().mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve(fakeRespondResult({ sentiment: 'positive' })), 50)),
    );
    const metaClient: MetaClient = { respond, listModels: vi.fn() };

    const result = await runAgent({
      name: 'sentiment-agent',
      promptVersion: 'P99@0.1',
      tier: 'T0',
      systemPreamble: 'P0',
      prompt: 'classify',
      outputSchema: SentimentSchema,
      limits: { maxOutputTokens: 100, timeoutMs: 5, maxCostUsd: 0.1 },
      ctx: baseCtx(metaClient),
    });

    expect(result).toEqual({ ok: false, reason: 'timeout', detail: expect.stringContaining('Timed out') });
  });

  it('maps a transport/API error to reason api_error', async () => {
    const respond = vi.fn().mockRejectedValue(new Error('Meta API responded with HTTP 500'));
    const metaClient: MetaClient = { respond, listModels: vi.fn() };

    const result = await runAgent({
      name: 'sentiment-agent',
      promptVersion: 'P99@0.1',
      tier: 'T0',
      systemPreamble: 'P0',
      prompt: 'classify',
      outputSchema: SentimentSchema,
      limits: { maxOutputTokens: 100, timeoutMs: 1000, maxCostUsd: 0.1 },
      ctx: baseCtx(metaClient),
    });

    expect(result).toEqual({ ok: false, reason: 'api_error', detail: expect.any(String) });
  });

  it('maps T0/T1/T2 to minimal/medium/high reasoning effort', async () => {
    const respond = vi.fn().mockResolvedValue(fakeRespondResult({ sentiment: 'positive' }));
    const metaClient: MetaClient = { respond, listModels: vi.fn() };

    for (const [tier, effort] of [
      ['T0', 'minimal'],
      ['T1', 'medium'],
      ['T2', 'high'],
    ] as const) {
      await runAgent({
        name: 'sentiment-agent',
        promptVersion: 'P99@0.1',
        tier,
        systemPreamble: 'P0',
        prompt: 'classify',
        outputSchema: SentimentSchema,
        limits: { maxOutputTokens: 100, timeoutMs: 1000, maxCostUsd: 0.1 },
        ctx: baseCtx(metaClient),
      });
      const lastCall = respond.mock.calls.at(-1)?.[0] as { reasoningEffort: string };
      expect(lastCall.reasoningEffort).toBe(effort);
    }
  });
});
