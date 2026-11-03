import { describe, expect, it, vi } from 'vitest';
import { createInMemoryBudgetGuard } from '@/shared/security';
import { CONVERSATION_MEMORY_TTL_MS, type ConversationContext } from '@/shared/domain';
import type { MetaClient } from '@/shared/meta';
import { isContextDependentQuery, resolveConversationQuery } from './conversation-resolver';

const context: ConversationContext = {
  id: '11111111-1111-4111-8111-111111111111',
  turns: [{
    id: 'turn-1',
    query: 'What evidence links HIF1A to hypoxia?',
    runId: '22222222-2222-4222-8222-222222222222',
    intent: 'evidence_map',
    overview: 'HIF1A coordinates transcriptional responses to low oxygen.',
    findings: [
      { id: 'claim-1', text: 'HIF1A increased expression of glycolytic genes.', sourceTitle: 'Hypoxia response study A' },
      { id: 'claim-2', text: 'The response differed between cell types.', sourceTitle: 'Hypoxia response study B' },
    ],
    sources: [{ id: 'source-1', title: 'Hypoxia response study A', year: 2024 }],
    capturedAt: Date.now(),
  }],
};

function deps(metaClient: MetaClient = { respond: vi.fn(), listModels: vi.fn() }) {
  return {
    metaClient,
    budgetGuard: createInMemoryBudgetGuard({ runCostCapUsd: 1, dailyBudgetUsd: 10 }),
    p0Preamble: 'Return structured output.',
  };
}

describe('conversation follow-up resolution', () => {
  it('does not add latency to an independent question', async () => {
    const metaClient: MetaClient = { respond: vi.fn(), listModels: vi.fn() };
    const result = await resolveConversationQuery('What is BRCA1?', context, deps(metaClient));
    expect(result.strategy).toBe('none');
    expect(result.standaloneQuery).toBe('What is BRCA1?');
    expect(metaClient.respond).not.toHaveBeenCalled();
  });

  it('resolves a gene reference deterministically', async () => {
    const result = await resolveConversationQuery('¿Y qué ocurre con ese gen?', context, deps());
    expect(result.strategy).toBe('deterministic');
    expect(result.standaloneQuery).toContain('HIF1A');
  });

  it('resolves an ordinal finding deterministically', async () => {
    const result = await resolveConversationQuery('Explícame mejor el segundo hallazgo', context, deps());
    expect(result.strategy).toBe('deterministic');
    expect(result.standaloneQuery).toContain('differed between cell types');
    expect(result.standaloneQuery).toContain('Hypoxia response study B');
  });

  it('resolves the previous study without invoking a model', async () => {
    const metaClient: MetaClient = { respond: vi.fn(), listModels: vi.fn() };
    const result = await resolveConversationQuery('Compáralo con el estudio anterior', context, deps(metaClient));
    expect(result.strategy).toBe('deterministic');
    expect(result.standaloneQuery).toContain('Hypoxia response study A');
    expect(metaClient.respond).not.toHaveBeenCalled();
  });

  it('recognizes English and Spanish contextual follow-ups', () => {
    expect(isContextDependentQuery('What about that gene?')).toBe(true);
    expect(isContextDependentQuery('¿Y qué ocurre con ese gen?')).toBe(true);
    expect(isContextDependentQuery('What is TP53?')).toBe(false);
  });

  it('uses one bounded model call only for an ambiguous elliptical follow-up', async () => {
    const respond = vi.fn().mockResolvedValue({
      id: 'response-1',
      text: '{"standaloneQuery":"How does the HIF1A response differ under normoxia?","relevantTurnIds":["turn-1"],"confidence":"high"}',
      parsed: { standaloneQuery: 'How does the HIF1A response differ under normoxia?', relevantTurnIds: ['turn-1'], confidence: 'high' },
      webSearchResults: [],
      usage: { inputTokens: 50, cachedInputTokens: 0, outputTokens: 20, totalTokens: 70 },
      costUsd: 0.001,
      raw: {},
    });
    const metaClient: MetaClient = { respond, listModels: vi.fn() };
    const result = await resolveConversationQuery('And under normoxia?', context, deps(metaClient));
    expect(result.strategy).toBe('model');
    expect(result.standaloneQuery).toContain('HIF1A');
    expect(respond).toHaveBeenCalledTimes(1);
  });

  it('keeps deterministic follow-up resolution below a negligible latency budget', async () => {
    const started = performance.now();
    for (let index = 0; index < 500; index++) {
      await resolveConversationQuery('¿Y qué ocurre con ese gen?', context, deps());
    }
    expect(performance.now() - started).toBeLessThan(200);
  });

  it('ignores an expired client capsule on the server as well', async () => {
    const expired = { ...context, turns: context.turns.map((turn) => ({ ...turn, capturedAt: Date.now() - CONVERSATION_MEMORY_TTL_MS })) };
    const result = await resolveConversationQuery('What about that gene?', expired, deps());
    expect(result.strategy).toBe('none');
    expect(result.standaloneQuery).toBe('What about that gene?');
  });
});
