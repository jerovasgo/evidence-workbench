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
      scope: 'SN2 reaction rate in polar aprotic solvents',
      context: 'in_vitro' as const,
      subQuestions: ['which solvents accelerate the reaction'],
      scopeParameters: { system: 'alkyl halide + nucleophile' },
    };
    const respond = vi.fn().mockResolvedValue(fakeRespondResult(structure));
    const metaClient: MetaClient = { respond, listModels: vi.fn() };

    const result = await structureScenario('run_1', { freeText: 'SN2 reaction rate, polar aprotic solvent' }, baseDeps(metaClient));

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toEqual(structure);
  });

  it('substitutes free text, condition and setting into the prompt template', async () => {
    const respond = vi.fn().mockResolvedValue(
      fakeRespondResult({ context: 'unknown', subQuestions: [], scopeParameters: {} }),
    );
    const metaClient: MetaClient = { respond, listModels: vi.fn() };

    await structureScenario(
      'run_1',
      { freeText: 'SN2 reaction rate, polar aprotic solvent', condition: 'SN2 reaction rate', setting: 'in_vitro' },
      baseDeps(metaClient),
    );

    const sentPrompt = (respond.mock.calls[0]?.[0] as { input: { content: string }[] }).input[1]?.content;
    expect(sentPrompt).toContain('SN2 reaction rate, polar aprotic solvent');
    expect(sentPrompt).toContain('SN2 reaction rate');
    expect(sentPrompt).toContain('in_vitro');
  });

  it('abstains with reason invalid when the model returns more than 6 sub-questions', async () => {
    const tooMany = {
      context: 'unknown' as const,
      subQuestions: Array.from({ length: 7 }, (_, i) => `q${i}`),
      scopeParameters: {},
    };
    const respond = vi.fn().mockResolvedValue(fakeRespondResult(tooMany));
    const metaClient: MetaClient = { respond, listModels: vi.fn() };

    const result = await structureScenario('run_1', { freeText: 'x' }, baseDeps(metaClient));
    expect(result).toEqual({ ok: false, reason: 'invalid', detail: expect.any(String) });
  });
});
