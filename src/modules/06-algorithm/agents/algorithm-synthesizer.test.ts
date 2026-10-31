import { describe, expect, it, vi } from 'vitest';
import type { MetaClient, RespondResult } from '@/shared/meta';
import { createInMemoryBudgetGuard } from '@/shared/security';
import { synthesizeAlgorithmGraph } from './algorithm-synthesizer';

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
    p9PromptTemplate: 'Synthesize: {{scope}} / {{sub_questions}} / {{claims_json}}',
  };
}

const baseInput = {
  scope: 'CRISPR-Cas9 guide RNA design',
  subQuestions: ['Does guide length affect off-target rate?'],
  claims: [{ id: 'c1', text: 'Longer guides reduce off-target editing.', actionType: 'finding' as const, conditions: [] }],
};

describe('synthesizeAlgorithmGraph', () => {
  it('returns a valid graph for a well-formed model response', async () => {
    const output = {
      nodes: [
        { id: 'n1', type: 'decision', label: 'Check guide length', claimIds: ['c1'], provenance: 'external' },
        { id: 'n2', type: 'outcome', label: 'Use this guide', claimIds: ['c1'], provenance: 'external' },
      ],
      edges: [{ from: 'n1', to: 'n2', condition: { variable: 'length', op: '>', value: 20, unit: 'nt' } }],
    };
    const respond = vi.fn().mockResolvedValue(fakeRespondResult(output));
    const metaClient: MetaClient = { respond, listModels: vi.fn() };

    const result = await synthesizeAlgorithmGraph('run_1', baseInput, baseDeps(metaClient));

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toEqual(output);
  });

  it('embeds scope, sub-questions and claims in the prompt', async () => {
    const respond = vi.fn().mockResolvedValue(fakeRespondResult({ nodes: [], edges: [] }));
    const metaClient: MetaClient = { respond, listModels: vi.fn() };

    await synthesizeAlgorithmGraph('run_1', baseInput, baseDeps(metaClient));

    const sentPrompt = (respond.mock.calls[0]?.[0] as { input: { content: string }[] }).input[1]?.content;
    expect(sentPrompt).toContain('CRISPR-Cas9 guide RNA design');
    expect(sentPrompt).toContain('off-target rate');
    expect(sentPrompt).toContain('Longer guides reduce off-target editing.');
  });

  it('appends a <violations> block to the prompt on a repair call', async () => {
    const respond = vi.fn().mockResolvedValue(fakeRespondResult({ nodes: [], edges: [] }));
    const metaClient: MetaClient = { respond, listModels: vi.fn() };

    await synthesizeAlgorithmGraph('run_1', baseInput, baseDeps(metaClient), 'multiple_starts: n1, n2');

    const sentPrompt = (respond.mock.calls[0]?.[0] as { input: { content: string }[] }).input[1]?.content;
    expect(sentPrompt).toContain('<violations>');
    expect(sentPrompt).toContain('multiple_starts: n1, n2');
  });

  it('scales the output token budget with claim count', async () => {
    const respond = vi.fn().mockResolvedValue(fakeRespondResult({ nodes: [], edges: [] }));
    const metaClient: MetaClient = { respond, listModels: vi.fn() };
    const manyClaims = Array.from({ length: 60 }, (_, i) => ({ id: `c${i}`, text: 'x', actionType: 'finding' as const, conditions: [] }));

    await synthesizeAlgorithmGraph('run_1', { ...baseInput, claims: manyClaims }, baseDeps(metaClient));

    expect(respond).toHaveBeenCalledWith(expect.objectContaining({ maxOutputTokens: 60 * 150 }));
  });

  it('rejects a claims array larger than 60 before ever calling the model', async () => {
    const respond = vi.fn();
    const metaClient: MetaClient = { respond, listModels: vi.fn() };
    const tooMany = Array.from({ length: 61 }, (_, i) => ({ id: `c${i}`, text: 'x', actionType: 'finding' as const, conditions: [] }));

    await expect(synthesizeAlgorithmGraph('run_1', { ...baseInput, claims: tooMany }, baseDeps(metaClient))).rejects.toThrow();
    expect(respond).not.toHaveBeenCalled();
  });
});
