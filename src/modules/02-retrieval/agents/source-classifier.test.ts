import { describe, expect, it, vi } from 'vitest';
import type { MetaClient, RespondResult } from '@/shared/meta';
import { createInMemoryBudgetGuard } from '@/shared/security';
import { classifySources } from './source-classifier';

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
    p4PromptTemplate: 'Classify: {{sources_json}}',
  };
}

describe('classifySources', () => {
  it('returns valid classifications for a batch of sources', async () => {
    const output = {
      classifications: [
        { sourceId: 's1', kind: 'guideline' as const, isScientific: true, confidence: 'high' as const },
        { sourceId: 's2', kind: 'rct' as const, isScientific: true, confidence: 'medium' as const },
      ],
    };
    const respond = vi.fn().mockResolvedValue(fakeRespondResult(output));
    const metaClient: MetaClient = { respond, listModels: vi.fn() };

    const result = await classifySources(
      'run_1',
      { sources: [{ sourceId: 's1', title: 'A', metadataAndText: 'x' }, { sourceId: 's2', title: 'B', metadataAndText: 'y' }] },
      baseDeps(metaClient),
    );

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toEqual(output);
  });

  it('scales the output token budget with the batch size', async () => {
    const respond = vi.fn().mockResolvedValue(fakeRespondResult({ classifications: [] }));
    const metaClient: MetaClient = { respond, listModels: vi.fn() };
    const sources = Array.from({ length: 40 }, (_, i) => ({ sourceId: `s${i}`, title: 'x', metadataAndText: 'y' }));

    await classifySources('run_1', { sources }, baseDeps(metaClient));

    expect(respond).toHaveBeenCalledWith(expect.objectContaining({ maxOutputTokens: 40 * 120 }));
  });

  it('embeds the sources as JSON in the prompt', async () => {
    const respond = vi.fn().mockResolvedValue(fakeRespondResult({ classifications: [] }));
    const metaClient: MetaClient = { respond, listModels: vi.fn() };

    await classifySources(
      'run_1',
      { sources: [{ sourceId: 's1', title: 'Chest pain guideline', metadataAndText: 'x' }] },
      baseDeps(metaClient),
    );

    const sentPrompt = (respond.mock.calls[0]?.[0] as { input: { content: string }[] }).input[1]?.content;
    expect(sentPrompt).toContain('Chest pain guideline');
  });

  it('rejects a batch larger than 40 sources before ever calling the model', async () => {
    const respond = vi.fn();
    const metaClient: MetaClient = { respond, listModels: vi.fn() };
    const sources = Array.from({ length: 41 }, (_, i) => ({ sourceId: `s${i}`, title: 'x', metadataAndText: 'y' }));

    await expect(classifySources('run_1', { sources }, baseDeps(metaClient))).rejects.toThrow();
    expect(respond).not.toHaveBeenCalled();
  });
});
