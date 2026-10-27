import { describe, expect, it, vi } from 'vitest';
import type { RunRecord, RunsRepository } from '@/lib/data/runs-repository';
import type { MetaClient, RespondResult } from '@/lib/meta/client';
import { createInMemoryBudgetGuard } from '@/lib/security/budget-guard';

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

function fakeRunsRepository(): RunsRepository {
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
      return run;
    }),
    getRun: vi.fn(async () => null),
  };
}

function mockRuntime(metaClient: MetaClient, dailyBudgetUsd = 20) {
  return {
    runsRepository: fakeRunsRepository(),
    metaClient,
    budgetGuard: createInMemoryBudgetGuard({ runCostCapUsd: 0.4, dailyBudgetUsd }),
    dailyBudgetUsd,
    p0Preamble: 'P0 preamble',
    p1PromptTemplate: 'Classify: {{free_text}}',
  };
}

vi.mock('@/lib/server/runtime', () => ({ getServerRuntime: vi.fn() }));

async function loadPostWithRuntime(runtime: ReturnType<typeof mockRuntime>) {
  const { getServerRuntime } = await import('@/lib/server/runtime');
  vi.mocked(getServerRuntime).mockReturnValue(runtime as never);
  const { POST } = await import('./route');
  return POST;
}

describe('POST /api/runs', () => {
  it('returns 400 for a non-JSON body', async () => {
    const metaClient: MetaClient = { respond: vi.fn(), listModels: vi.fn() };
    const POST = await loadPostWithRuntime(mockRuntime(metaClient));

    const res = await POST(new Request('http://localhost/api/runs', { method: 'POST', body: 'not json' }));
    expect(res.status).toBe(400);
  });

  it('returns 400 when freeText is missing', async () => {
    const metaClient: MetaClient = { respond: vi.fn(), listModels: vi.fn() };
    const POST = await loadPostWithRuntime(mockRuntime(metaClient));

    const res = await POST(
      new Request('http://localhost/api/runs', {
        method: 'POST',
        body: JSON.stringify({ userId: null }),
      }),
    );
    expect(res.status).toBe(400);
  });

  it('returns 422 when the request names a patient', async () => {
    const metaClient: MetaClient = { respond: vi.fn(), listModels: vi.fn() };
    const POST = await loadPostWithRuntime(mockRuntime(metaClient));

    const res = await POST(
      new Request('http://localhost/api/runs', {
        method: 'POST',
        body: JSON.stringify({ freeText: 'My patient Jane Doe has chest pain', userId: null }),
      }),
    );
    expect(res.status).toBe(422);
    expect(metaClient.respond).not.toHaveBeenCalled();
  });

  it('returns 429 when the daily budget is already exhausted', async () => {
    const metaClient: MetaClient = { respond: vi.fn(), listModels: vi.fn() };
    const runtime = mockRuntime(metaClient);
    runtime.budgetGuard.record('other_run', 20);
    const POST = await loadPostWithRuntime(runtime);

    const res = await POST(
      new Request('http://localhost/api/runs', {
        method: 'POST',
        body: JSON.stringify({ freeText: 'What is first-line treatment for ACS?', userId: null }),
      }),
    );
    expect(res.status).toBe(429);
  });

  it('returns 201 with the runId and intent on a successful routing', async () => {
    const respond = vi.fn().mockResolvedValue(fakeRespondResult({ intent: 'algorithm', confidence: 'high' }));
    const metaClient: MetaClient = { respond, listModels: vi.fn() };
    const POST = await loadPostWithRuntime(mockRuntime(metaClient));

    const res = await POST(
      new Request('http://localhost/api/runs', {
        method: 'POST',
        body: JSON.stringify({ freeText: 'What is first-line treatment for suspected ACS?', userId: null }),
      }),
    );
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.intent).toBe('algorithm');
    expect(typeof json.runId).toBe('string');
  });

  it('returns 502 when the router agent fails to produce valid output', async () => {
    const respond = vi.fn().mockResolvedValue(fakeRespondResult({ intent: 'not_a_real_intent' }));
    const metaClient: MetaClient = { respond, listModels: vi.fn() };
    const POST = await loadPostWithRuntime(mockRuntime(metaClient));

    const res = await POST(
      new Request('http://localhost/api/runs', {
        method: 'POST',
        body: JSON.stringify({ freeText: 'ambiguous text', userId: null }),
      }),
    );
    expect(res.status).toBe(502);
  });
});
