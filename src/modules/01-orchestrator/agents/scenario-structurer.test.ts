import { describe, expect, it, vi } from 'vitest';
import type { MetaClient, RespondResult } from '@/shared/meta';
import { createInMemoryBudgetGuard } from '@/shared/security';
import { structureScenario } from './scenario-structurer';

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
    p2PromptTemplate: 'Structure: {{free_text}} / {{condition}} / {{setting}}',
  };
}

describe('structureScenario', () => {
  it('returns a valid ScenarioStructure on a well-formed model response', async () => {
    const structure = {
      population: 'adult with chest pain',
      setting: 'emergency' as const,
      subQuestions: ['first-line treatment'],
      genericParameters: { ageGroup: 'adult' },
    };
    const respond = vi.fn().mockResolvedValue(fakeRespondResult(structure));
    const metaClient: MetaClient = { respond, listModels: vi.fn() };

    const result = await structureScenario('run_1', { freeText: 'adult with chest pain, ED' }, baseDeps(metaClient));

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toEqual(structure);
  });

  it('substitutes free text, condition and setting into the prompt template', async () => {
    const respond = vi.fn().mockResolvedValue(
      fakeRespondResult({ setting: 'unknown', subQuestions: [], genericParameters: {} }),
    );
    const metaClient: MetaClient = { respond, listModels: vi.fn() };

    await structureScenario(
      'run_1',
      { freeText: 'suspected ACS, adult male', condition: 'suspected ACS', setting: 'emergency' },
      baseDeps(metaClient),
    );

    const sentPrompt = (respond.mock.calls[0]?.[0] as { input: { content: string }[] }).input[1]?.content;
    expect(sentPrompt).toContain('suspected ACS, adult male');
    expect(sentPrompt).toContain('suspected ACS');
    expect(sentPrompt).toContain('emergency');
  });

  it('abstains with reason invalid when the model returns more than 6 sub-questions', async () => {
    const tooMany = {
      setting: 'unknown' as const,
      subQuestions: Array.from({ length: 7 }, (_, i) => `q${i}`),
      genericParameters: {},
    };
    const respond = vi.fn().mockResolvedValue(fakeRespondResult(tooMany));
    const metaClient: MetaClient = { respond, listModels: vi.fn() };

    const result = await structureScenario('run_1', { freeText: 'x' }, baseDeps(metaClient));
    expect(result).toEqual({ ok: false, reason: 'invalid', detail: expect.any(String) });
  });
});
