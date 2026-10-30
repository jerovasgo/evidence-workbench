import { describe, expect, it, vi } from 'vitest';
import { createPendingRunContextStore, type RunRecord, type RunsRepository } from '@/modules/01-orchestrator';
import type { MetaClient, RespondResult } from '@/shared/meta';
import { createInMemoryBudgetGuard } from '@/shared/security';

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

function fakeRunsRepository(overrides: Partial<RunsRepository> = {}): RunsRepository {
  return { createRun: vi.fn(), getRun: vi.fn(async () => null), updateRunStatus: vi.fn(), ...overrides };
}

const routingRun: RunRecord = {
  id: 'run_1',
  userId: null,
  isPrecomputed: true,
  intent: 'algorithm',
  status: 'routing',
  createdAt: '2026-10-27T00:00:00.000Z',
};

function mockRuntime(
  metaClient: MetaClient,
  runsRepository: RunsRepository,
  pendingRunContext = createPendingRunContextStore(),
  stageOutputsRepository = { insert: vi.fn(), getLatestPerStage: vi.fn().mockResolvedValue(new Map()) },
) {
  return {
    runsRepository,
    stageOutputsRepository,
    metaClient,
    budgetGuard: createInMemoryBudgetGuard({ runCostCapUsd: 1, dailyBudgetUsd: 20 }),
    crossref: { lookup: vi.fn().mockResolvedValue(null) },
    p0Preamble: 'P0',
    p2PromptTemplate: 'Structure: {{free_text}} / {{condition}} / {{setting}}',
    p3PromptTemplate: 'Plan for {{condition}} / {{sub_questions}} / {{setting}} / {{country}}',
    p4PromptTemplate: 'Classify: {{sources_json}}',
    p5PromptTemplate: 'Extract: {{source_title}} / {{sub_questions}} / {{passages}}',
    p7PromptTemplate: 'Relate: {{pairs_json}}',
    p10PromptTemplate: 'Judge: {{claim_text}} / {{conditions_json}} / {{quote}} / {{surrounding_context}}',
    pubmed: { search: vi.fn().mockResolvedValue({ pmids: [] }), fetchSummaries: vi.fn().mockResolvedValue([]) },
    europePmc: { search: vi.fn().mockResolvedValue([]), fetchFullText: vi.fn().mockResolvedValue(null) },
    pendingRunContext,
  };
}

vi.mock(import('@/modules/01-orchestrator'), async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, getServerRuntime: vi.fn() };
});

vi.mock(import('@/modules/05-governance'), async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, labelRelationsBatched: vi.fn() };
});

async function loadGetWithRuntime(runtime: ReturnType<typeof mockRuntime>) {
  const { getServerRuntime } = await import('@/modules/01-orchestrator');
  vi.mocked(getServerRuntime).mockReturnValue(runtime as never);
  const { GET } = await import('./route');
  return GET;
}

async function readAllEvents(res: Response): Promise<Record<string, unknown>[]> {
  const text = await res.text();
  return text
    .split('\n\n')
    .filter((chunk) => chunk.startsWith('data: '))
    .map((chunk) => JSON.parse(chunk.slice('data: '.length)));
}

describe('GET /api/runs/[id]/stream', () => {
  it('returns 404 when the run does not exist', async () => {
    const metaClient: MetaClient = { respond: vi.fn(), listModels: vi.fn() };
    const GET = await loadGetWithRuntime(mockRuntime(metaClient, fakeRunsRepository()));

    const res = await GET(new Request('http://localhost/api/runs/missing/stream'), { params: Promise.resolve({ id: 'missing' }) });
    expect(res.status).toBe(404);
  });

  it('streams a single done event for a run that already finished', async () => {
    const metaClient: MetaClient = { respond: vi.fn(), listModels: vi.fn() };
    const finishedRun: RunRecord = { ...routingRun, status: 'done' };
    const GET = await loadGetWithRuntime(mockRuntime(metaClient, fakeRunsRepository({ getRun: vi.fn(async () => finishedRun) })));

    const res = await GET(new Request('http://localhost/api/runs/run_1/stream'), { params: Promise.resolve({ id: 'run_1' }) });
    const events = await readAllEvents(res);

    expect(events).toEqual([{ type: 'done', runId: 'run_1', status: 'done' }]);
    expect(metaClient.respond).not.toHaveBeenCalled();
  });

  it('emits an error and done(failed) when no pending context is available for a routing run', async () => {
    const metaClient: MetaClient = { respond: vi.fn(), listModels: vi.fn() };
    const runsRepository = fakeRunsRepository({ getRun: vi.fn(async () => routingRun) });
    const GET = await loadGetWithRuntime(mockRuntime(metaClient, runsRepository)); // empty pending store

    const res = await GET(new Request('http://localhost/api/runs/run_1/stream'), { params: Promise.resolve({ id: 'run_1' }) });
    const events = await readAllEvents(res);

    expect(events[0]).toMatchObject({ type: 'error', runId: 'run_1' });
    expect(events[1]).toEqual({ type: 'done', runId: 'run_1', status: 'failed' });
  });

  it('streams stage events, a band_ready, a receipt_ready and a final done for a routing run with pending context', async () => {
    const respond = vi.fn().mockResolvedValue(fakeRespondResult({ setting: 'bogus' })); // invalid for every stage's schema
    const metaClient: MetaClient = { respond, listModels: vi.fn() };
    const runsRepository = fakeRunsRepository({ getRun: vi.fn(async () => routingRun) });
    const pendingRunContext = createPendingRunContextStore();
    pendingRunContext.put('run_1', { freeText: 'suspected ACS', routerCondition: 'suspected ACS' });

    const GET = await loadGetWithRuntime(mockRuntime(metaClient, runsRepository, pendingRunContext));
    const res = await GET(new Request('http://localhost/api/runs/run_1/stream'), { params: Promise.resolve({ id: 'run_1' }) });
    const events = await readAllEvents(res);

    expect(events[0]).toMatchObject({ type: 'opening_ready', runId: 'run_1' });
    expect(events.some((e) => e.type === 'stage_started' && e.stage === 'plan')).toBe(true);
    expect(events.some((e) => e.type === 'band_ready')).toBe(true);
    expect(events.some((e) => e.type === 'receipt_ready')).toBe(true);
    expect(events.some((event) => event.type === 'done')).toBe(true);
    expect(events.at(-1)).toMatchObject({ type: 'relations_ready' });
    expect(runsRepository.updateRunStatus).toHaveBeenCalledWith('run_1', expect.any(String));
    // Consumed once — a second take() would return null (pending context's own test covers that directly).
  });

  it('resumes from persisted stage outputs when pending context is gone but stage_outputs exist', async () => {
    const respond = vi.fn().mockResolvedValue(fakeRespondResult({ queries: [] })); // plan's own call, if it runs
    const metaClient: MetaClient = { respond, listModels: vi.fn() };
    const runsRepository = fakeRunsRepository({ getRun: vi.fn(async () => routingRun) });
    const persistedStructure = {
      stage: 'structure',
      status: 'ok',
      value: { context: 'in_vitro', subQuestions: [], scopeParameters: {} },
      metrics: { ms: 1, costUsd: 0.001 },
      createdAt: '2026-10-27T00:00:00Z',
    };
    const stageOutputsRepository = {
      insert: vi.fn(),
      getLatestPerStage: vi.fn().mockResolvedValue(new Map([['structure', persistedStructure]])),
    };

    const GET = await loadGetWithRuntime(
      mockRuntime(metaClient, runsRepository, createPendingRunContextStore(), stageOutputsRepository), // no pending context put
    );
    const res = await GET(new Request('http://localhost/api/runs/run_1/stream'), { params: Promise.resolve({ id: 'run_1' }) });
    const events = await readAllEvents(res);

    // Structure is resumed (no 'stage_started' for it), plan runs fresh.
    expect(events.some((e) => e.type === 'stage_started' && (e as { stage: string }).stage === 'structure')).toBe(false);
    expect(events.find((e) => e.type === 'stage_progress' && (e as { stage: string }).stage === 'structure')).toMatchObject({
      detail: expect.stringContaining('resumed'),
    });
    expect(events.some((event) => event.type === 'done')).toBe(true);
    expect(events.at(-1)).toMatchObject({ type: 'relations_ready' });
  });

  it('runs relation labelling after the terminal done event and persists it as a "relate" stage output, with no extra SSE frame', async () => {
    const metaClient: MetaClient = { respond: vi.fn(), listModels: vi.fn() };
    const runsRepository = fakeRunsRepository({ getRun: vi.fn(async () => routingRun) });

    const claimA = {
      id: 'claim_a',
      text: 'Give aspirin.',
      basis: 'primary' as const,
      actionType: 'finding' as const,
      conditions: [],
      subQuestionIndex: 0,
      sourceId: 's1',
      passageId: 'p1',
      quote: 'Aspirin.',
      grade: { certainty: 'ungraded' as const, origin: 'ai_estimated' as const },
      verification: { exists: true, quoteFound: true, retracted: false, support: 'supports' as const, retractionCheck: 'crossref_no_signal' as const },
      safetyCritical: false,
    };
    const claimB = { ...claimA, id: 'claim_b', sourceId: 's2', quote: 'Low-dose aspirin.' };

    const metrics = { ms: 1, costUsd: 0 };
    const stageOutputsRepository = {
      insert: vi.fn(),
      getLatestPerStage: vi.fn().mockResolvedValue(
        new Map([
          ['structure', { stage: 'structure', status: 'ok', value: { context: 'in_vitro', subQuestions: [], scopeParameters: {} }, metrics, createdAt: 'x' }],
          ['plan', { stage: 'plan', status: 'ok', value: { queries: [] }, metrics, createdAt: 'x' }],
          ['retrieve', { stage: 'retrieve', status: 'ok', value: [], metrics, createdAt: 'x' }],
          ['classify', { stage: 'classify', status: 'ok', value: [], metrics, createdAt: 'x' }],
          ['extract', { stage: 'extract', status: 'ok', value: [claimA, claimB], metrics, createdAt: 'x' }],
        ]),
      ),
    };

    const GET = await loadGetWithRuntime(mockRuntime(metaClient, runsRepository, createPendingRunContextStore(), stageOutputsRepository));

    const { labelRelationsBatched } = await import('@/modules/05-governance');
    vi.mocked(labelRelationsBatched).mockResolvedValue({ relations: [{ from: 'claim_a', to: 'claim_b', kind: 'agrees', evidence: 'both recommend aspirin' }], failures: [], costUsd: 0 });

    const res = await GET(new Request('http://localhost/api/runs/run_1/stream'), { params: Promise.resolve({ id: 'run_1' }) });
    const events = await readAllEvents(res);

    expect(events.at(-1)).toMatchObject({ type: 'relations_ready', status: 'ok' });
    expect(events.findIndex((event) => event.type === 'done')).toBeLessThan(events.findIndex((event) => event.type === 'relations_ready'));
    expect(labelRelationsBatched).toHaveBeenCalledTimes(1);
    expect(vi.mocked(labelRelationsBatched).mock.calls[0]?.[1]).toEqual([{ a: claimA, b: claimB }]);
    expect(stageOutputsRepository.insert).toHaveBeenCalledWith(
      expect.objectContaining({ runId: 'run_1', stage: 'relate', status: 'ok', value: [{ from: 'claim_a', to: 'claim_b', kind: 'agrees', evidence: 'both recommend aspirin' }] }),
    );
  });

  it('never lets a relation-labelling failure surface as a stream error after done was already sent', async () => {
    const metaClient: MetaClient = { respond: vi.fn(), listModels: vi.fn() };
    const runsRepository = fakeRunsRepository({ getRun: vi.fn(async () => routingRun) });

    const claimA = {
      id: 'claim_a',
      text: 'Give aspirin.',
      basis: 'primary' as const,
      actionType: 'finding' as const,
      conditions: [],
      subQuestionIndex: 0,
      sourceId: 's1',
      passageId: 'p1',
      quote: 'Aspirin.',
      grade: { certainty: 'ungraded' as const, origin: 'ai_estimated' as const },
      verification: { exists: true, quoteFound: true, retracted: false, support: 'supports' as const, retractionCheck: 'crossref_no_signal' as const },
      safetyCritical: false,
    };
    const claimB = { ...claimA, id: 'claim_b', sourceId: 's2', quote: 'Low-dose aspirin.' };
    const metrics = { ms: 1, costUsd: 0 };
    const stageOutputsRepository = {
      insert: vi.fn(),
      getLatestPerStage: vi.fn().mockResolvedValue(
        new Map([
          ['structure', { stage: 'structure', status: 'ok', value: { context: 'in_vitro', subQuestions: [], scopeParameters: {} }, metrics, createdAt: 'x' }],
          ['plan', { stage: 'plan', status: 'ok', value: { queries: [] }, metrics, createdAt: 'x' }],
          ['retrieve', { stage: 'retrieve', status: 'ok', value: [], metrics, createdAt: 'x' }],
          ['classify', { stage: 'classify', status: 'ok', value: [], metrics, createdAt: 'x' }],
          ['extract', { stage: 'extract', status: 'ok', value: [claimA, claimB], metrics, createdAt: 'x' }],
        ]),
      ),
    };

    const GET = await loadGetWithRuntime(mockRuntime(metaClient, runsRepository, createPendingRunContextStore(), stageOutputsRepository));

    const { labelRelationsBatched } = await import('@/modules/05-governance');
    vi.mocked(labelRelationsBatched).mockRejectedValue(new Error('boom'));

    const res = await GET(new Request('http://localhost/api/runs/run_1/stream'), { params: Promise.resolve({ id: 'run_1' }) });
    const events = await readAllEvents(res);

    expect(events.at(-1)).toMatchObject({ type: 'relations_ready', status: 'failed' });
    expect(events.some((e) => e.type === 'error')).toBe(false);
  });
});
