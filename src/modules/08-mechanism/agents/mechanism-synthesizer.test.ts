import { describe, expect, it, vi } from 'vitest';
import type { MetaClient, RespondResult } from '@/shared/meta';
import { createInMemoryBudgetGuard } from '@/shared/security';
import { synthesizeMechanismGraph } from './mechanism-synthesizer';

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
    budgetGuard: createInMemoryBudgetGuard({ runCostCapUsd: 1, dailyBudgetUsd: 20 }),
    p0Preamble: 'P0 preamble',
    p16PromptTemplate: 'Synthesize: {{scope}} / {{sub_questions}} / {{claims_json}}',
  };
}

const baseInput = {
  scope: 'CRISPR-Cas9 cleavage mechanism',
  subQuestions: ['How does Cas9 cleave double-stranded DNA?'],
  claims: [{ id: 'c1', text: 'Cas9 cleaves DNA via its HNH and RuvC domains.', quote: 'Cas9 cleaves DNA via its HNH and RuvC domains.', sourceId: 's1' }],
};

describe('synthesizeMechanismGraph', () => {
  it('returns a valid graph for a well-formed model response', async () => {
    const output = {
      scope: 'CRISPR-Cas9 cleavage',
      entities: [
        { id: 'e1', label: 'Cas9', kind: 'enzyme' },
        { id: 'e2', label: 'Target DNA', kind: 'other' },
      ],
      interactions: [{ id: 'i1', from: 'e1', to: 'e2', type: 'binds', sign: '+', order: 0, claimId: 'c1' }],
    };
    const respond = vi.fn().mockResolvedValue(fakeRespondResult(output));
    const metaClient: MetaClient = { respond, listModels: vi.fn() };

    const result = await synthesizeMechanismGraph('run_1', baseInput, baseDeps(metaClient));

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toEqual(output);
  });

  it('embeds scope, sub-questions and claims in the prompt', async () => {
    const respond = vi.fn().mockResolvedValue(fakeRespondResult({ scope: '', entities: [], interactions: [] }));
    const metaClient: MetaClient = { respond, listModels: vi.fn() };

    await synthesizeMechanismGraph('run_1', baseInput, baseDeps(metaClient));

    const sentPrompt = (respond.mock.calls[0]?.[0] as { input: { content: string }[] }).input[1]?.content;
    expect(sentPrompt).toContain('CRISPR-Cas9 cleavage mechanism');
    expect(sentPrompt).toContain('cleave double-stranded DNA');
    expect(sentPrompt).toContain('HNH and RuvC domains');
  });

  it('appends a <violations> block to the prompt on a repair call', async () => {
    const respond = vi.fn().mockResolvedValue(fakeRespondResult({ scope: '', entities: [], interactions: [] }));
    const metaClient: MetaClient = { respond, listModels: vi.fn() };

    await synthesizeMechanismGraph('run_1', baseInput, baseDeps(metaClient), 'orphan_entity: e3');

    const sentPrompt = (respond.mock.calls[0]?.[0] as { input: { content: string }[] }).input[1]?.content;
    expect(sentPrompt).toContain('<violations>');
    expect(sentPrompt).toContain('orphan_entity: e3');
  });

  it('scales the output token budget with claim count', async () => {
    const respond = vi.fn().mockResolvedValue(fakeRespondResult({ scope: '', entities: [], interactions: [] }));
    const metaClient: MetaClient = { respond, listModels: vi.fn() };
    const manyClaims = Array.from({ length: 60 }, (_, i) => ({ id: `c${i}`, text: 'x', quote: 'x', sourceId: 's1' }));

    await synthesizeMechanismGraph('run_1', { ...baseInput, claims: manyClaims }, baseDeps(metaClient));

    expect(respond).toHaveBeenCalledWith(expect.objectContaining({ maxOutputTokens: 60 * 150 }));
  });

  it('rejects a claims array larger than 60 before ever calling the model', async () => {
    const respond = vi.fn();
    const metaClient: MetaClient = { respond, listModels: vi.fn() };
    const tooMany = Array.from({ length: 61 }, (_, i) => ({ id: `c${i}`, text: 'x', quote: 'x', sourceId: 's1' }));

    await expect(synthesizeMechanismGraph('run_1', { ...baseInput, claims: tooMany }, baseDeps(metaClient))).rejects.toThrow();
    expect(respond).not.toHaveBeenCalled();
  });
});
