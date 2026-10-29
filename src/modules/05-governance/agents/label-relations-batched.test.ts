import { describe, expect, it, vi } from 'vitest';
import type { MetaClient, RespondResult } from '@/shared/meta';
import { createInMemoryBudgetGuard } from '@/shared/security';
import type { ClaimPair } from '../pipeline/pair-claims';
import { labelRelationsBatched } from './label-relations-batched';

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

function baseDeps(metaClient: MetaClient, overrides: Partial<Parameters<typeof labelRelationsBatched>[2]> = {}) {
  return {
    metaClient,
    budgetGuard: createInMemoryBudgetGuard({ runCostCapUsd: 0.4, dailyBudgetUsd: 20 }),
    p0Preamble: 'P0 preamble',
    p7PromptTemplate: 'Relate: {{pairs_json}}',
    ...overrides,
  };
}

function baseClaim() {
  return {
    id: 'c1',
    text: 'Give aspirin.',
    basis: 'recommendation' as const,
    actionType: 'treat' as const,
    conditions: [],
    sourceId: 's1',
    passageId: 'p1',
    quote: 'Aspirin.',
    grade: { certainty: 'ungraded' as const, origin: 'ai_estimated' as const },
    verification: { exists: true, quoteFound: true, retracted: false, support: 'supports' as const },
    safetyCritical: false,
  };
}

function claim(overrides: Partial<ReturnType<typeof baseClaim>>) {
  return { ...baseClaim(), ...overrides };
}

function pair(i: number): ClaimPair {
  return { a: claim({ id: `a${i}`, sourceId: 's1' }), b: claim({ id: `b${i}`, sourceId: 's2' }) };
}

describe('labelRelationsBatched', () => {
  it('splits pairs into batches of 10 and merges relations from every batch', async () => {
    const pairs = Array.from({ length: 15 }, (_, i) => pair(i));
    const respond = vi
      .fn()
      .mockResolvedValueOnce(fakeRespondResult({ relations: [{ pairId: 0, kind: 'agrees', evidence: 'e1' }] }))
      .mockResolvedValueOnce(fakeRespondResult({ relations: [{ pairId: 0, kind: 'differs', evidence: 'e2' }] }));
    const metaClient: MetaClient = { respond, listModels: vi.fn() };

    const result = await labelRelationsBatched('run_1', pairs, baseDeps(metaClient));

    expect(respond).toHaveBeenCalledTimes(2);
    expect(result.relations).toHaveLength(2);
    expect(result.failures).toEqual([]);
  });

  it('records a batch failure without losing relations from the other batches', async () => {
    const pairs = Array.from({ length: 11 }, (_, i) => pair(i));
    const respond = vi
      .fn()
      .mockResolvedValueOnce(fakeRespondResult({ relations: [{ pairId: 0, kind: 'agrees', evidence: 'e1' }] }))
      .mockRejectedValueOnce(new Error('network blip'));
    const metaClient: MetaClient = { respond, listModels: vi.fn() };

    const result = await labelRelationsBatched('run_1', pairs, baseDeps(metaClient));

    expect(result.relations).toHaveLength(1);
    expect(result.failures).toHaveLength(1);
  });

  it('respects a lower batch size and concurrency when the caller sets one', async () => {
    const pairs = Array.from({ length: 4 }, (_, i) => pair(i));
    const respond = vi.fn().mockResolvedValue(fakeRespondResult({ relations: [] }));
    const metaClient: MetaClient = { respond, listModels: vi.fn() };

    await labelRelationsBatched('run_1', pairs, baseDeps(metaClient, { batchSize: 2, maxConcurrency: 1 }));

    expect(respond).toHaveBeenCalledTimes(2);
  });
});
