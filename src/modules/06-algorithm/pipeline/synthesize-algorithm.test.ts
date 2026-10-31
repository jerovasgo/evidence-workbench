import { describe, expect, it, vi } from 'vitest';
import type { MetaClient, RespondResult } from '@/shared/meta';
import { createInMemoryBudgetGuard } from '@/shared/security';
import { computeBand, synthesizeAlgorithm } from './synthesize-algorithm';
import type { AlgorithmGraph } from '../schemas/algorithm';

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

const validGraph: AlgorithmGraph = {
  nodes: [
    { id: 'n1', type: 'decision', label: 'Check guide length', claimIds: ['c1'], provenance: 'external' },
    { id: 'n2', type: 'outcome', label: 'Use this guide', claimIds: ['c1'], provenance: 'external' },
  ],
  edges: [{ from: 'n1', to: 'n2', condition: { variable: 'length', op: '>', value: 20, unit: 'nt' } }],
};

// Two start nodes — fails validateAlgorithmGraph's invariant, not the zod schema.
const invalidGraph: AlgorithmGraph = {
  nodes: [
    { id: 'n1', type: 'outcome', label: 'A', claimIds: [], provenance: 'external' },
    { id: 'n2', type: 'outcome', label: 'B', claimIds: [], provenance: 'external' },
  ],
  edges: [],
};

describe('synthesizeAlgorithm', () => {
  it('returns ok with a computed band and external provenance when the first attempt is valid', async () => {
    const respond = vi.fn().mockResolvedValue(fakeRespondResult(validGraph));
    const metaClient: MetaClient = { respond, listModels: vi.fn() };

    const result = await synthesizeAlgorithm('run_1', baseInput, baseDeps(metaClient));

    expect(respond).toHaveBeenCalledTimes(1);
    expect(result.status).toBe('ok');
    if (result.status === 'ok') {
      expect(result.graph.nodes.every((n) => n.provenance === 'external')).toBe(true);
      expect(result.band).toEqual({ criticalChecks: [], firstAction: null });
    }
  });

  it('repairs once when the first graph is schema-valid but fails an invariant, then succeeds', async () => {
    const respond = vi.fn().mockResolvedValueOnce(fakeRespondResult(invalidGraph)).mockResolvedValueOnce(fakeRespondResult(validGraph));
    const metaClient: MetaClient = { respond, listModels: vi.fn() };

    const result = await synthesizeAlgorithm('run_1', baseInput, baseDeps(metaClient));

    expect(respond).toHaveBeenCalledTimes(2);
    const repairPrompt = (respond.mock.calls[1]?.[0] as { input: { content: string }[] }).input[1]?.content;
    expect(repairPrompt).toContain('<violations>');
    expect(repairPrompt).toContain('multiple_starts');
    expect(result.status).toBe('ok');
  });

  it('abstains with the violation list when the graph still fails invariants after one repair', async () => {
    const respond = vi.fn().mockResolvedValue(fakeRespondResult(invalidGraph));
    const metaClient: MetaClient = { respond, listModels: vi.fn() };

    const result = await synthesizeAlgorithm('run_1', baseInput, baseDeps(metaClient));

    expect(respond).toHaveBeenCalledTimes(2);
    expect(result.status).toBe('abstained');
    if (result.status === 'abstained') expect(result.reason).toContain('multiple_starts');
  });

  it('abstains immediately without a repair call when the first attempt fails outright (e.g. invalid output after its own retry)', async () => {
    const respond = vi.fn().mockResolvedValue(fakeRespondResult({ not: 'a graph' }));
    const metaClient: MetaClient = { respond, listModels: vi.fn() };

    const result = await synthesizeAlgorithm('run_1', baseInput, baseDeps(metaClient));

    // runAgent's own schema-repair retry already consumed 2 calls; no third (manual) call follows.
    expect(respond).toHaveBeenCalledTimes(2);
    expect(result.status).toBe('abstained');
  });
});

describe('computeBand', () => {
  it('collects up to 4 critical_check nodes and the first action/method node reached from the start', () => {
    const graph: AlgorithmGraph = {
      nodes: [
        { id: 'cc1', type: 'critical_check', label: 'x', claimIds: [], provenance: 'external' },
        { id: 'a1', type: 'assess', label: 'x', claimIds: [], provenance: 'external' },
        { id: 'act1', type: 'action', label: 'x', claimIds: ['c1'], provenance: 'external' },
        { id: 'out1', type: 'outcome', label: 'x', claimIds: [], provenance: 'external' },
      ],
      edges: [
        { from: 'cc1', to: 'a1', condition: { variable: 'x', op: '=', value: 1 } },
        { from: 'a1', to: 'act1', condition: { variable: 'x', op: '=', value: 1 } },
        { from: 'act1', to: 'out1', condition: { variable: 'x', op: '=', value: 1 } },
      ],
    };
    expect(computeBand(graph)).toEqual({ criticalChecks: ['cc1'], firstAction: 'act1' });
  });

  it('caps critical checks at 4 and returns a null firstAction when no action/method node exists', () => {
    const checks = Array.from({ length: 6 }, (_, i) => ({ id: `cc${i}`, type: 'critical_check' as const, label: 'x', claimIds: [], provenance: 'external' as const }));
    const graph: AlgorithmGraph = { nodes: [...checks, { id: 'out1', type: 'outcome', label: 'x', claimIds: [], provenance: 'external' }], edges: [] };
    const band = computeBand(graph);
    expect(band.criticalChecks).toHaveLength(4);
    expect(band.firstAction).toBeNull();
  });
});
