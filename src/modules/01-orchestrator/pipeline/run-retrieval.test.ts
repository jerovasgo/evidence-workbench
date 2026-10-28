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
    pubmed: fakePubmed(),
    europePmc: fakeEuropePmc(),
    ...overrides,
  };
}

const STRUCTURE_OUTPUT = {
  setting: 'emergency' as const,
  subQuestions: ['first-line treatment'],
  genericParameters: {},
};
const PLAN_OUTPUT = { queries: [{ family: 'pubmed' as const, text: 'acs', purpose: 'first-line treatment' }] };
const CLASSIFY_OUTPUT = {
  classifications: [{ sourceId: 'pubmed:111', kind: 'rct' as const, isScientific: true, confidence: 'high' as const }],
};

describe('runRetrievalPipeline', () => {
  it('runs structure -> plan -> retrieve -> classify end to end and applies the PubMed type override', async () => {
    const respond = vi
      .fn()
      .mockResolvedValueOnce(fakeRespondResult(STRUCTURE_OUTPUT))
      .mockResolvedValueOnce(fakeRespondResult(PLAN_OUTPUT))
      .mockResolvedValueOnce(fakeRespondResult(CLASSIFY_OUTPUT));
    const metaClient: MetaClient = { respond, listModels: vi.fn() };
    const pubmed = fakePubmed({
      search: vi.fn().mockResolvedValue({ pmids: ['111'] }),
      fetchSummaries: vi.fn().mockResolvedValue([
        { pmid: '111', title: 'A trial', pubTypes: ['Practice Guideline'] },
      ]),
    });

    const result = await runRetrievalPipeline(
      { runId: 'run_1', freeText: 'adult with chest pain', routerCondition: 'suspected ACS' },
      baseDeps(metaClient, { pubmed }),
    );

    expect(result.structure.status).toBe('ok');
    expect(result.plan.status).toBe('ok');
    expect(result.retrieval.status).toBe('ok');
    expect(result.retrieval.value).toHaveLength(1);
    expect(result.classification.status).toBe('ok');
    // The model classified sourceId pubmed:111 as 'rct', but its PubMed type is
    // "Practice Guideline" — the deterministic override must win.
    expect(result.classification.value?.[0]).toMatchObject({ sourceId: 'pubmed:111', kind: 'guideline' });
  });

  it('falls back to the router condition for planning when structure fails', async () => {
    // Structure's output is invalid on both the first attempt and the repair retry
    // (runAgent's harness), so it takes 2 calls before abstaining; plan's call is the 3rd.
    const respond = vi
      .fn()
      .mockResolvedValueOnce(fakeRespondResult({ setting: 'bogus' }))
      .mockResolvedValueOnce(fakeRespondResult({ setting: 'bogus' }))
      .mockResolvedValueOnce(fakeRespondResult({ queries: [] }));
    const metaClient: MetaClient = { respond, listModels: vi.fn() };

    const result = await runRetrievalPipeline(
      { runId: 'run_1', freeText: 'x', routerCondition: 'suspected ACS' },
      baseDeps(metaClient),
    );

    expect(result.structure.status).toBe('failed');
    const planPrompt = (respond.mock.calls[2]?.[0] as { input: { content: string }[] }).input[1]?.content;
    expect(planPrompt).toContain('suspected ACS');
    expect(result.plan.status).toBe('ok');
  });

  it('abstains classification and fails retrieval when the plan stage fails', async () => {
    const tooManyQueries = {
      queries: Array.from({ length: 13 }, (_, i) => ({ family: 'pubmed' as const, text: `q${i}`, purpose: `p${i}` })),
    };
    const respond = vi
      .fn()
      .mockResolvedValueOnce(fakeRespondResult(STRUCTURE_OUTPUT))
      .mockResolvedValueOnce(fakeRespondResult(tooManyQueries))
      .mockResolvedValueOnce(fakeRespondResult(tooManyQueries));
    const metaClient: MetaClient = { respond, listModels: vi.fn() };

    const result = await runRetrievalPipeline({ runId: 'run_1', freeText: 'x' }, baseDeps(metaClient));

    expect(result.plan.status).toBe('failed');
    expect(result.retrieval.status).toBe('failed');
    expect(result.classification.status).toBe('abstain');
  });

  it('keeps retrieved candidates even when classification fails', async () => {
    const respond = vi
      .fn()
      .mockResolvedValueOnce(fakeRespondResult(STRUCTURE_OUTPUT))
      .mockResolvedValueOnce(fakeRespondResult(PLAN_OUTPUT))
      .mockResolvedValueOnce(fakeRespondResult({ classifications: 'not-an-array' }))
      .mockResolvedValueOnce(fakeRespondResult({ classifications: 'still-not-an-array' }));
    const metaClient: MetaClient = { respond, listModels: vi.fn() };
    const pubmed = fakePubmed({
      search: vi.fn().mockResolvedValue({ pmids: ['111'] }),
      fetchSummaries: vi.fn().mockResolvedValue([{ pmid: '111', title: 'A trial', pubTypes: [] }]),
    });

    const result = await runRetrievalPipeline({ runId: 'run_1', freeText: 'x' }, baseDeps(metaClient, { pubmed }));

    expect(result.retrieval.status).toBe('ok');
    expect(result.retrieval.value).toHaveLength(1);
    expect(result.classification.status).toBe('failed');
  });

  describe('resumability (stageOutputs)', () => {
    it('resumes a stage with a usable prior output instead of recomputing it', async () => {
      const respond = vi.fn().mockResolvedValueOnce(fakeRespondResult(PLAN_OUTPUT)); // plan is the only real call now
      const metaClient: MetaClient = { respond, listModels: vi.fn() };
      const stageOutputs = fakeStageOutputsRepository({
        structure: { stage: 'structure', status: 'ok', value: STRUCTURE_OUTPUT, metrics: { ms: 1, costUsd: 0.001 }, createdAt: '2026-10-28T00:00:00Z' },
      });

      const result = await runRetrievalPipeline({ runId: 'run_1', freeText: 'x' }, baseDeps(metaClient, { stageOutputs }));

      expect(result.structure).toEqual({ stage: 'structure', status: 'ok', value: STRUCTURE_OUTPUT, metrics: { ms: 1, costUsd: 0.001 } });
      expect(result.plan.status).toBe('ok');
      // Only 1 call (plan) -- structure was resumed, not recomputed, and classify
      // abstains with no retrieved candidates (this test's pubmed fake is empty).
      expect(respond).toHaveBeenCalledTimes(1);
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

      expect(stageOutputs.inserted.map((r) => r.stage)).toEqual(['structure', 'plan', 'retrieve', 'classify', 'extract']);
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
