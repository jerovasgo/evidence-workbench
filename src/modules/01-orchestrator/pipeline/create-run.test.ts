import { describe, expect, it, vi } from 'vitest';
import type { RunRecord, RunsRepository } from '../data/runs-repository';
import type { MetaClient, RespondResult } from '@/shared/meta';
import { createInMemoryBudgetGuard } from '@/shared/security';
import { createRun, getRunForViewer, type CreateRunDeps } from './create-run';

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
  const createdRuns: RunRecord[] = [];
  return {
    createRun: vi.fn(async (input) => {
      const run: RunRecord = {
        id: input.id ?? 'run_generated',
        userId: input.userId,
        isPrecomputed: input.isPrecomputed,
        intent: input.intent,
        status: input.status,
        createdAt: '2026-10-27T00:00:00.000Z',
      };
      createdRuns.push(run);
      return run;
    }),
    getRun: vi.fn(async () => null),
    ...overrides,
  };
}

function baseDeps(metaClient: MetaClient, runsRepository: RunsRepository): CreateRunDeps {
  return {
    runsRepository,
    metaClient,
    budgetGuard: createInMemoryBudgetGuard({ runCostCapUsd: 0.4, dailyBudgetUsd: 20 }),
    dailyBudgetUsd: 20,
    p0Preamble: 'P0 preamble',
    p1PromptTemplate: 'Classify: {{free_text}}',
  };
}

describe('createRun', () => {
  it('rejects a request with a patient identifier before calling the model at all', async () => {
    const respond = vi.fn();
    const metaClient: MetaClient = { respond, listModels: vi.fn() };
    const runsRepository = fakeRunsRepository();

    const result = await createRun(
      { freeText: 'My patient Maria Gonzalez has chest pain.', userId: null },
      baseDeps(metaClient, runsRepository),
    );

    expect(result.status).toBe('rejected_identifiers');
    expect(respond).not.toHaveBeenCalled();
    expect(runsRepository.createRun).not.toHaveBeenCalled();
  });

  it('refuses to create a new run once the daily budget is exhausted', async () => {
    const respond = vi.fn();
    const metaClient: MetaClient = { respond, listModels: vi.fn() };
    const runsRepository = fakeRunsRepository();
    const deps = baseDeps(metaClient, runsRepository);
    deps.budgetGuard.record('some_other_run', 20); // today's spend already at the cap

    const result = await createRun({ freeText: 'What is first-line treatment for ACS?', userId: null }, deps);

    expect(result.status).toBe('budget_exhausted');
    expect(respond).not.toHaveBeenCalled();
  });

  it('routes a normal clinical question and creates a run with the router\'s intent', async () => {
    const respond = vi.fn().mockResolvedValue(fakeRespondResult({ intent: 'algorithm', confidence: 'high' }));
    const metaClient: MetaClient = { respond, listModels: vi.fn() };
    const runsRepository = fakeRunsRepository();

    const result = await createRun(
      { freeText: 'What is first-line treatment for suspected ACS?', userId: null },
      baseDeps(metaClient, runsRepository),
    );

    expect(result.status).toBe('routed');
    if (result.status !== 'routed') throw new Error('unreachable');
    expect(result.routerOutput.intent).toBe('algorithm');
    expect(result.run.intent).toBe('algorithm');
    expect(result.run.status).toBe('routing');
    expect(result.run.isPrecomputed).toBe(true); // userId === null
  });

  it('marks an out_of_scope routing result as abstained rather than routing', async () => {
    const respond = vi.fn().mockResolvedValue(
      fakeRespondResult({ intent: 'out_of_scope', confidence: 'high', reject: { reason: 'names a specific patient' } }),
    );
    const metaClient: MetaClient = { respond, listModels: vi.fn() };
    const runsRepository = fakeRunsRepository();

    const result = await createRun({ freeText: 'some edge-case text', userId: null }, baseDeps(metaClient, runsRepository));

    expect(result.status).toBe('routed');
    if (result.status !== 'routed') throw new Error('unreachable');
    expect(result.run.status).toBe('abstained');
  });

  it('sets isPrecomputed = false and stores the userId for a signed-in request', async () => {
    const respond = vi.fn().mockResolvedValue(fakeRespondResult({ intent: 'fact_lookup', confidence: 'medium' }));
    const metaClient: MetaClient = { respond, listModels: vi.fn() };
    const runsRepository = fakeRunsRepository();
    const userId = '11111111-1111-1111-1111-111111111111';

    const result = await createRun({ freeText: 'What dose of aspirin for ACS?', userId }, baseDeps(metaClient, runsRepository));

    expect(result.status).toBe('routed');
    if (result.status !== 'routed') throw new Error('unreachable');
    expect(result.run.isPrecomputed).toBe(false);
    expect(result.run.userId).toBe(userId);
  });

  it('creates a failed run and returns routing_failed when the router agent abstains', async () => {
    const respond = vi.fn().mockResolvedValue(fakeRespondResult({ intent: 'not_a_real_intent' }));
    const metaClient: MetaClient = { respond, listModels: vi.fn() };
    const runsRepository = fakeRunsRepository();

    const result = await createRun({ freeText: 'ambiguous text', userId: null }, baseDeps(metaClient, runsRepository));

    expect(result.status).toBe('routing_failed');
    if (result.status !== 'routing_failed') throw new Error('unreachable');
    expect(result.run.status).toBe('failed');
    expect(result.run.intent).toBe('unknown');
    expect(result.reason).toBe('invalid');
  });
});

describe('getRunForViewer', () => {
  const precomputedRun: RunRecord = {
    id: 'run_1',
    userId: null,
    isPrecomputed: true,
    intent: 'algorithm',
    status: 'done',
    createdAt: '2026-10-27T00:00:00.000Z',
  };
  const privateRun: RunRecord = {
    id: 'run_2',
    userId: 'owner_1',
    isPrecomputed: false,
    intent: 'algorithm',
    status: 'done',
    createdAt: '2026-10-27T00:00:00.000Z',
  };

  it('returns not_found when the run does not exist', async () => {
    const repo = fakeRunsRepository({ getRun: vi.fn(async () => null) });
    expect(await getRunForViewer('missing', null, { runsRepository: repo })).toEqual({ status: 'not_found' });
  });

  it('lets anyone, including anonymous viewers, see a precomputed run', async () => {
    const repo = fakeRunsRepository({ getRun: vi.fn(async () => precomputedRun) });
    expect(await getRunForViewer('run_1', null, { runsRepository: repo })).toEqual({ status: 'found', run: precomputedRun });
  });

  it('lets the owner see their own private run', async () => {
    const repo = fakeRunsRepository({ getRun: vi.fn(async () => privateRun) });
    expect(await getRunForViewer('run_2', 'owner_1', { runsRepository: repo })).toEqual({ status: 'found', run: privateRun });
  });

  it('forbids a different user from seeing someone else\'s private run', async () => {
    const repo = fakeRunsRepository({ getRun: vi.fn(async () => privateRun) });
    expect(await getRunForViewer('run_2', 'someone_else', { runsRepository: repo })).toEqual({ status: 'forbidden' });
  });
});
