import { describe, expect, it, vi } from 'vitest';
import type { CrossrefClient, EuropePmcClient, PubmedClient } from '@/modules/02-retrieval';
import type { MetaClient, RespondResult } from '@/shared/meta';
import { createInMemoryBudgetGuard } from '@/shared/security';
import type { StageOutputRecord, StageOutputsRepository } from '../data/stage-outputs-repository';
import { runRetrievalPipeline } from './run-retrieval';

function fakeStageOutputsRepository(initial: Record<string, StageOutputRecord> = {}): StageOutputsRepository & { inserted: StageOutputRecord[] } {
  const inserted: StageOutputRecord[] = [];
  return {
    inserted,
    insert: vi.fn(async (input) => {
      inserted.push({ stage: input.stage, status: input.status, value: input.value, reasons: input.reasons, metrics: input.metrics, createdAt: new Date().toISOString() });
    }),
    getLatestPerStage: vi.fn(async () => new Map(Object.entries(initial))),
  };
}

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

function fakePubmed(overrides: Partial<PubmedClient> = {}): PubmedClient {
  return { search: vi.fn().mockResolvedValue({ pmids: [] }), fetchSummaries: vi.fn().mockResolvedValue([]), ...overrides };
}

function fakeEuropePmc(overrides: Partial<EuropePmcClient> = {}): EuropePmcClient {
  return { search: vi.fn().mockResolvedValue([]), fetchFullText: vi.fn().mockResolvedValue(null), ...overrides };
}

function fakeCrossref(overrides: Partial<CrossrefClient> = {}): CrossrefClient {
  return { lookup: vi.fn().mockResolvedValue(null), ...overrides };
}

function baseDeps(metaClient: MetaClient, overrides: Partial<Parameters<typeof runRetrievalPipeline>[1]> = {}) {
  return {
    metaClient,
    budgetGuard: createInMemoryBudgetGuard({ runCostCapUsd: 1, dailyBudgetUsd: 20 }),
    crossref: fakeCrossref(),
    p0Preamble: 'P0',
    p2PromptTemplate: 'Structure: {{free_text}} / {{condition}} / {{setting}}',
    p3PromptTemplate: 'Plan for {{condition}} / {{sub_questions}} / {{setting}} / {{country}}',
    p4PromptTemplate: 'Classify: {{sources_json}}',
    p5PromptTemplate: 'Extract: {{source_title}} / {{sub_questions}} / {{passages}}',
    p10PromptTemplate: 'Judge: {{claim_text}} / {{conditions_json}} / {{quote}} / {{surrounding_context}}',
    pubmed: fakePubmed(),
    europePmc: fakeEuropePmc(),
    ...overrides,
  };
}

const STRUCTURE_OUTPUT = {
  context: 'in_vitro' as const,
  subQuestions: ['which solvents accelerate the reaction'],
  scopeParameters: {},
};
const PLAN_OUTPUT = { queries: [{ family: 'pubmed' as const, text: 'sn2 reaction', purpose: 'which solvents accelerate the reaction' }] };
const CLASSIFY_OUTPUT = {
  classifications: [{ sourceId: 'pubmed:111', kind: 'controlled_experiment' as const, isScientific: true, confidence: 'high' as const }],
};

describe('runRetrievalPipeline', () => {
  it('runs the deterministic plan and classifies explicit PubMed metadata', async () => {
    const respond = vi.fn().mockResolvedValue(fakeRespondResult(STRUCTURE_OUTPUT));
    const metaClient: MetaClient = { respond, listModels: vi.fn() };
    const pubmed = fakePubmed({
      search: vi.fn().mockResolvedValue({ pmids: ['111'] }),
      fetchSummaries: vi.fn().mockResolvedValue([
        { pmid: '111', title: 'A trial', pubTypes: ['Practice Guideline'] },
      ]),
    });

    const result = await runRetrievalPipeline(
      { runId: 'run_1', freeText: 'SN2 reaction rate in polar aprotic solvent', routerCondition: 'SN2 reaction rate' },
      baseDeps(metaClient, { pubmed }),
    );

    expect(result.structure.status).toBe('ok');
    expect(result.plan.status).toBe('ok');
    expect(result.retrieval.status).toBe('ok');
    expect(result.retrieval.value).toHaveLength(1);
    expect(result.classification.status).toBe('ok');
    // A decisive publication type is enough; no classifier model call is needed.
    expect(result.classification.value?.[0]).toMatchObject({ sourceId: 'pubmed:111', kind: 'standards_body' });
    expect(respond).toHaveBeenCalledTimes(1);
    // Module 04 Part B: source scores are computed from the (overridden) classification.
    expect(result.sourceScores['pubmed:111']?.level).toBeCloseTo(0.9, 5); // standards_body level weight
  });

  it('starts seeded retrieval before the structure agent finishes', async () => {
    let finishStructure: ((value: RespondResult) => void) | undefined;
    const delayedStructure = new Promise<RespondResult>((resolve) => { finishStructure = resolve; });
    const respond = vi.fn().mockReturnValue(delayedStructure);
    const metaClient: MetaClient = { respond, listModels: vi.fn() };
    const pubmed = fakePubmed();
    const pending = runRetrievalPipeline(
      { runId: 'run_1', freeText: 'How does solvent affect an SN2 reaction?', routerCondition: 'SN2 reaction rate' },
      baseDeps(metaClient, { pubmed }),
    );
    await vi.waitFor(() => expect(pubmed.search).toHaveBeenCalled());
    finishStructure!(fakeRespondResult(STRUCTURE_OUTPUT));
    const result = await pending;
    expect(result.structure.status).toBe('ok');
    expect(result.plan.value?.queries.some((query) => query.text.includes('solvent'))).toBe(true);
  });

  it('keeps the deterministic search plan when structure fails', async () => {
    const respond = vi
      .fn()
      .mockResolvedValueOnce(fakeRespondResult({ context: 'bogus' }))
      .mockResolvedValueOnce(fakeRespondResult({ context: 'bogus' }))
      .mockResolvedValueOnce(fakeRespondResult({ queries: [] }));
    const metaClient: MetaClient = { respond, listModels: vi.fn() };

    const result = await runRetrievalPipeline(
      { runId: 'run_1', freeText: 'How does solvent affect an SN2 reaction?', routerCondition: 'SN2 reaction rate' },
      baseDeps(metaClient),
    );

    expect(result.structure.status).toBe('failed');
    expect(result.plan.status).toBe('ok');
    expect(result.plan.value?.queries.some((query) => query.text.includes('solvent'))).toBe(true);
  });

  it('abstains classification when both indexes return no candidates', async () => {
    const respond = vi.fn().mockResolvedValue(fakeRespondResult(STRUCTURE_OUTPUT));
    const metaClient: MetaClient = { respond, listModels: vi.fn() };

    const result = await runRetrievalPipeline({ runId: 'run_1', freeText: 'x' }, baseDeps(metaClient));

    expect(result.plan.status).toBe('ok');
    expect(result.retrieval.value).toEqual([]);
    expect(result.classification.status).toBe('abstain');
  });

  it('keeps retrieved candidates with unknown study design instead of guessing it', async () => {
    const respond = vi.fn().mockResolvedValue(fakeRespondResult(STRUCTURE_OUTPUT));
    const metaClient: MetaClient = { respond, listModels: vi.fn() };
    const pubmed = fakePubmed({
      search: vi.fn().mockResolvedValue({ pmids: ['111'] }),
      fetchSummaries: vi.fn().mockResolvedValue([{ pmid: '111', title: 'A trial', pubTypes: [] }]),
    });

    const result = await runRetrievalPipeline({ runId: 'run_1', freeText: 'x' }, baseDeps(metaClient, { pubmed }));

    expect(result.retrieval.status).toBe('ok');
    expect(result.retrieval.value).toHaveLength(1);
    expect(result.classification.status).toBe('ok');
    expect(result.classification.value?.[0]).toMatchObject({ kind: 'other', confidence: 'low' });
  });

  describe('resumability (stageOutputs)', () => {
    it('resumes a stage with a usable prior output instead of recomputing it', async () => {
      const respond = vi.fn().mockResolvedValue(fakeRespondResult({ queries: [] }));
      const metaClient: MetaClient = { respond, listModels: vi.fn() };
      const stageOutputs = fakeStageOutputsRepository({
        structure: { stage: 'structure', status: 'ok', value: STRUCTURE_OUTPUT, metrics: { ms: 1, costUsd: 0.001 }, createdAt: '2026-10-28T00:00:00Z' },
      });

      const result = await runRetrievalPipeline({ runId: 'run_1', freeText: 'x' }, baseDeps(metaClient, { stageOutputs }));

      expect(result.structure).toEqual({ stage: 'structure', status: 'ok', value: STRUCTURE_OUTPUT, metrics: { ms: 1, costUsd: 0.001 } });
      expect(result.plan.status).toBe('ok');
      expect(respond).toHaveBeenCalledTimes(1); // empty seed result triggers expansion
      // Structure wasn't re-persisted since it was resumed, not recomputed.
      expect(stageOutputs.inserted.some((r) => r.stage === 'structure')).toBe(false);
      expect(stageOutputs.inserted.some((r) => r.stage === 'plan')).toBe(true);
    });

    it('does not resume a stage whose prior attempt failed', async () => {
      const respond = vi.fn().mockResolvedValue(fakeRespondResult(STRUCTURE_OUTPUT));
      const metaClient: MetaClient = { respond, listModels: vi.fn() };
      const stageOutputs = fakeStageOutputsRepository({
        structure: { stage: 'structure', status: 'failed', reasons: ['invalid'], metrics: { ms: 1, costUsd: 0 }, createdAt: '2026-10-28T00:00:00Z' },
      });

      await runRetrievalPipeline({ runId: 'run_1', freeText: 'x' }, baseDeps(metaClient, { stageOutputs }));

      expect(respond).toHaveBeenCalled(); // structure was recomputed, not resumed from the failed attempt
    });

    it('persists every freshly computed stage', async () => {
      const respond = vi
        .fn()
        .mockResolvedValueOnce(fakeRespondResult(STRUCTURE_OUTPUT))
        .mockResolvedValueOnce(fakeRespondResult(PLAN_OUTPUT))
        .mockResolvedValueOnce(fakeRespondResult(CLASSIFY_OUTPUT));
      const metaClient: MetaClient = { respond, listModels: vi.fn() };
      const stageOutputs = fakeStageOutputsRepository();

      await runRetrievalPipeline({ runId: 'run_1', freeText: 'x' }, baseDeps(metaClient, { stageOutputs }));

      expect(stageOutputs.inserted.map((r) => r.stage)).toEqual(['plan', 'structure', 'retrieve', 'classify', 'extract']);
    });

    it('still completes the run when persistence itself fails', async () => {
      const respond = vi.fn().mockResolvedValue(fakeRespondResult(STRUCTURE_OUTPUT));
      const metaClient: MetaClient = { respond, listModels: vi.fn() };
      const stageOutputs: StageOutputsRepository = {
        insert: vi.fn().mockRejectedValue(new Error('db down')),
        getLatestPerStage: vi.fn().mockResolvedValue(new Map()),
      };

      const result = await runRetrievalPipeline({ runId: 'run_1', freeText: 'x' }, baseDeps(metaClient, { stageOutputs }));

      expect(result.structure.status).toBe('ok');
    });
  });
});
