import { describe, expect, it, vi } from 'vitest';
import type { MetaClient, RespondResult } from '@/shared/meta';
import { createInMemoryBudgetGuard } from '@/shared/security';
import type { ClaimPair } from '../pipeline/pair-claims';
import { labelRelations } from './relation-labeller';

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
    p7PromptTemplate: 'Relate: {{pairs_json}}',
  };
}

function claim(overrides: Partial<ReturnType<typeof baseClaim>>) {
  return { ...baseClaim(), ...overrides };
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

describe('labelRelations', () => {
  it('reconstructs real claim ids for pairId echoed back by the model', async () => {
    const a = claim({ id: 'claim_a', sourceId: 's1' });
    const b = claim({ id: 'claim_b', sourceId: 's2' });
    const pairs: ClaimPair[] = [{ a, b }];

    const output = { relations: [{ pairId: 0, kind: 'agrees' as const, evidence: 'both agree' }] };
    const respond = vi.fn().mockResolvedValue(fakeRespondResult(output));
    const metaClient: MetaClient = { respond, listModels: vi.fn() };

    const result = await labelRelations('run_1', pairs, baseDeps(metaClient));

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.relations).toEqual([{ from: 'claim_a', to: 'claim_b', kind: 'agrees', evidence: 'both agree' }]);
    }
  });

  it('drops a verdict whose pairId does not match any pair sent, rather than trusting it', async () => {
    const a = claim({ id: 'claim_a', sourceId: 's1' });
    const b = claim({ id: 'claim_b', sourceId: 's2' });
    const pairs: ClaimPair[] = [{ a, b }];

    const output = { relations: [{ pairId: 7, kind: 'contradicts' as const, evidence: 'hallucinated' }] };
    const respond = vi.fn().mockResolvedValue(fakeRespondResult(output));
    const metaClient: MetaClient = { respond, listModels: vi.fn() };

    const result = await labelRelations('run_1', pairs, baseDeps(metaClient));

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.relations).toEqual([]);
  });

  it('never includes a pair the model omitted as unclear', async () => {
    const pairs: ClaimPair[] = [
      { a: claim({ id: 'a1', sourceId: 's1' }), b: claim({ id: 'b1', sourceId: 's2' }) },
      { a: claim({ id: 'a2', sourceId: 's1' }), b: claim({ id: 'b2', sourceId: 's2' }) },
    ];

    const output = { relations: [{ pairId: 1, kind: 'differs' as const, evidence: 'scope differs' }] };
    const respond = vi.fn().mockResolvedValue(fakeRespondResult(output));
    const metaClient: MetaClient = { respond, listModels: vi.fn() };

    const result = await labelRelations('run_1', pairs, baseDeps(metaClient));

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.relations).toEqual([{ from: 'a2', to: 'b2', kind: 'differs', evidence: 'scope differs' }]);
  });

  it('embeds the pairs as JSON in the prompt, never a claim id as pairId', async () => {
    const pairs: ClaimPair[] = [{ a: claim({ id: 'claim_a' }), b: claim({ id: 'claim_b', sourceId: 's2' }) }];
    const respond = vi.fn().mockResolvedValue(fakeRespondResult({ relations: [] }));
    const metaClient: MetaClient = { respond, listModels: vi.fn() };

    await labelRelations('run_1', pairs, baseDeps(metaClient));

    const sentPrompt = (respond.mock.calls[0]?.[0] as { input: { content: string }[] }).input[1]?.content;
    expect(sentPrompt).toContain('"pairId":0');
    expect(sentPrompt).not.toContain('claim_a');
  });
});
