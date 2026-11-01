import { describe, expect, it, vi } from 'vitest';
import type { MetaClient, RespondResult } from '@/shared/meta';
import { createInMemoryBudgetGuard } from '@/shared/security';
import { synthesizeMechanism } from './synthesize-mechanism';
import type { MechanismGraph } from '../schemas/mechanism';

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

const validGraph: MechanismGraph = {
  scope: 'CRISPR-Cas9 cleavage',
  entities: [
    { id: 'e1', label: 'Cas9', kind: 'enzyme' },
    { id: 'e2', label: 'Target DNA', kind: 'other' },
  ],
  interactions: [{ id: 'i1', from: 'e1', to: 'e2', type: 'binds', sign: '+', order: 0, claimId: 'c1' }],
};

// e2 referenced by no interaction's from/to at all — fails validateMechanismGraph's
// orphan_entity invariant, not the zod schema.
const invalidGraph: MechanismGraph = {
  scope: 'CRISPR-Cas9 cleavage',
  entities: [
    { id: 'e1', label: 'Cas9', kind: 'enzyme' },
    { id: 'e2', label: 'Unused', kind: 'other' },
  ],
  interactions: [],
};

describe('synthesizeMechanism', () => {
  it('returns ok when the first attempt is valid', async () => {
    const respond = vi.fn().mockResolvedValue(fakeRespondResult(validGraph));
    const metaClient: MetaClient = { respond, listModels: vi.fn() };

    const result = await synthesizeMechanism('run_1', baseInput, baseDeps(metaClient));

    expect(respond).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ status: 'ok', graph: validGraph });
  });

  it('repairs once when the first graph is schema-valid but fails an invariant, then succeeds', async () => {
    const respond = vi.fn().mockResolvedValueOnce(fakeRespondResult(invalidGraph)).mockResolvedValueOnce(fakeRespondResult(validGraph));
    const metaClient: MetaClient = { respond, listModels: vi.fn() };

    const result = await synthesizeMechanism('run_1', baseInput, baseDeps(metaClient));

    expect(respond).toHaveBeenCalledTimes(2);
    const repairPrompt = (respond.mock.calls[1]?.[0] as { input: { content: string }[] }).input[1]?.content;
    expect(repairPrompt).toContain('<violations>');
    expect(repairPrompt).toContain('orphan_entity');
    expect(result.status).toBe('ok');
  });

  it('abstains with the violation list when the graph still fails invariants after one repair', async () => {
    const respond = vi.fn().mockResolvedValue(fakeRespondResult(invalidGraph));
    const metaClient: MetaClient = { respond, listModels: vi.fn() };

    const result = await synthesizeMechanism('run_1', baseInput, baseDeps(metaClient));

    expect(respond).toHaveBeenCalledTimes(2);
    expect(result.status).toBe('abstained');
    if (result.status === 'abstained') expect(result.reason).toContain('orphan_entity');
  });

  it('abstains immediately without a repair call when the first attempt fails outright (e.g. invalid output after its own retry)', async () => {
    const respond = vi.fn().mockResolvedValue(fakeRespondResult({ not: 'a graph' }));
    const metaClient: MetaClient = { respond, listModels: vi.fn() };

    const result = await synthesizeMechanism('run_1', baseInput, baseDeps(metaClient));

    // runAgent's own schema-repair retry already consumed 2 calls; no third (manual) call follows.
    expect(respond).toHaveBeenCalledTimes(2);
    expect(result.status).toBe('abstained');
  });
});
