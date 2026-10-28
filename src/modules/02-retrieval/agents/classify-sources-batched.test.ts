import { describe, expect, it, vi } from 'vitest';
import type { MetaClient, RespondResult } from '@/shared/meta';
import { createInMemoryBudgetGuard } from '@/shared/security';
import { classifySourcesBatched } from './classify-sources-batched';

function fakeRespondResult(parsed: unknown): RespondResult {
  return {
    id: 'resp_x',
    text: JSON.stringify(parsed),
    parsed,
    webSearchResults: [],
    usage: { inputTokens: 10, cachedInputTokens: 0, outputTokens: 10, totalTokens: 20 },
    costUsd: 0.002,
    raw: {},
  };
}

function baseDeps(metaClient: MetaClient, overrides: Partial<Parameters<typeof classifySourcesBatched>[2]> = {}) {
  return {
    metaClient,
    budgetGuard: createInMemoryBudgetGuard({ runCostCapUsd: 1, dailyBudgetUsd: 20 }),
    p0Preamble: 'P0',
    p4PromptTemplate: 'Classify: {{sources_json}}',
    ...overrides,
  };
}

function sourcesOf(n: number) {
  return Array.from({ length: n }, (_, i) => ({ sourceId: `s${i}`, title: `Source ${i}`, metadataAndText: 'x' }));
}

describe('classifySourcesBatched', () => {
  it('splits sources into batches of 10 and issues one call per batch', async () => {
    const respond = vi.fn().mockImplementation(async (params: { input: { content: string }[] }) => {
      const prompt = params.input[1]!.content;
      // Return one classification per sourceId mentioned in that batch's prompt.
      const ids = [...prompt.matchAll(/"sourceId":"(s\d+)"/g)].map((m) => m[1]);
      return fakeRespondResult({ classifications: ids.map((sourceId) => ({ sourceId, kind: 'rct', isScientific: true, confidence: 'medium' })) });
    });
    const metaClient: MetaClient = { respond, listModels: vi.fn() };

    const result = await classifySourcesBatched('run_1', sourcesOf(25), baseDeps(metaClient));

    expect(respond).toHaveBeenCalledTimes(3); // 10 + 10 + 5
    expect(result.classifications).toHaveLength(25);
    expect(result.failures).toEqual([]);
  });

  it('never sends more than maxConcurrency batches at once', async () => {
    let inFlight = 0;
    let maxObservedInFlight = 0;
    const respond = vi.fn().mockImplementation(async () => {
      inFlight++;
      maxObservedInFlight = Math.max(maxObservedInFlight, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight--;
      return fakeRespondResult({ classifications: [] });
    });
    const metaClient: MetaClient = { respond, listModels: vi.fn() };

    await classifySourcesBatched('run_1', sourcesOf(40), baseDeps(metaClient, { maxConcurrency: 2, batchSize: 10 }));

    expect(maxObservedInFlight).toBeLessThanOrEqual(2);
  });

  it('keeps classifications from batches that succeeded when another batch fails', async () => {
    // Batch 2 (sources 10-19) always returns invalid output (both the initial
    // attempt and runAgent's repair retry); keyed off the prompt content, not call
    // order, so this stays correct regardless of concurrency scheduling.
    const respond = vi.fn().mockImplementation(async (params: { input: { content: string }[] }) => {
      const prompt = params.input[1]!.content;
      if (prompt.includes('"s15"')) return fakeRespondResult({ classifications: 'not-an-array' });
      return fakeRespondResult({ classifications: [{ sourceId: 'ok', kind: 'rct', isScientific: true, confidence: 'medium' }] });
    });
    const metaClient: MetaClient = { respond, listModels: vi.fn() };

    const result = await classifySourcesBatched('run_1', sourcesOf(30), baseDeps(metaClient));

    expect(result.classifications.length).toBeGreaterThan(0);
    expect(result.failures).toHaveLength(1);
  });

  it('sums cost across every successful batch', async () => {
    const respond = vi.fn().mockResolvedValue(fakeRespondResult({ classifications: [] }));
    const metaClient: MetaClient = { respond, listModels: vi.fn() };

    const result = await classifySourcesBatched('run_1', sourcesOf(25), baseDeps(metaClient));

    expect(result.costUsd).toBeCloseTo(0.002 * 3, 5);
  });
});
