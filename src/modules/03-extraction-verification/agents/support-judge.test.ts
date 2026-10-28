import { describe, expect, it, vi } from 'vitest';
import type { MetaClient, RespondResult } from '@/shared/meta';
import { createInMemoryBudgetGuard } from '@/shared/security';
import { judgeSupport } from './support-judge';

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
    p10PromptTemplate: 'Judge: {{claim_text}} / {{conditions_json}} / {{quote}} / {{surrounding_context}}',
  };
}

const INPUT = {
  claimText: 'Give aspirin 325 mg for suspected ACS.',
  conditions: [],
  quote: 'Aspirin 325 mg should be given promptly in suspected ACS.',
  surroundingContext: '... Aspirin 325 mg should be given promptly in suspected ACS. ...',
};

describe('judgeSupport', () => {
  it('returns a valid verdict for a well-formed model response', async () => {
    const output = { support: 'supports' as const, issues: [], note: 'Population, condition and action all match.' };
    const respond = vi.fn().mockResolvedValue(fakeRespondResult(output));
    const metaClient: MetaClient = { respond, listModels: vi.fn() };

    const result = await judgeSupport('run_1', INPUT, baseDeps(metaClient));

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toEqual(output);
  });

  it('embeds the claim text, quote and context in the prompt', async () => {
    const respond = vi.fn().mockResolvedValue(fakeRespondResult({ support: 'unknown', issues: [], note: 'x' }));
    const metaClient: MetaClient = { respond, listModels: vi.fn() };

    await judgeSupport('run_1', INPUT, baseDeps(metaClient));

    const sentPrompt = (respond.mock.calls[0]?.[0] as { input: { content: string }[] }).input[1]?.content;
    expect(sentPrompt).toContain('Give aspirin 325 mg for suspected ACS.');
    expect(sentPrompt).toContain('Aspirin 325 mg should be given promptly in suspected ACS.');
  });

  it('abstains with reason invalid when the model returns a support value outside the enum', async () => {
    const respond = vi.fn().mockResolvedValue(fakeRespondResult({ support: 'strongly_supports', issues: [], note: 'x' }));
    const metaClient: MetaClient = { respond, listModels: vi.fn() };

    const result = await judgeSupport('run_1', INPUT, baseDeps(metaClient));
    expect(result).toEqual({ ok: false, reason: 'invalid', detail: expect.any(String) });
  });
});
