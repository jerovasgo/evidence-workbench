import { describe, expect, it, vi } from 'vitest';
import type { RunRecord, RunsRepository } from '@/modules/01-orchestrator';
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
    updateRunStatus: vi.fn(),
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
    p2PromptTemplate: 'Structure: {{free_text}} / {{condition}} / {{setting}}',
    p3PromptTemplate: 'Plan for {{condition}} / {{sub_questions}} / {{setting}} / {{country}}',
    p4PromptTemplate: 'Classify: {{sources_json}}',
    p5PromptTemplate: 'Extract: {{source_title}} / {{sub_questions}} / {{passages}}',
    pubmed: { search: vi.fn(), fetchSummaries: vi.fn() },
    europePmc: { search: vi.fn(), fetchFullText: vi.fn() },
    crossref: { lookup: vi.fn() },
    pendingRunContext: { put: vi.fn(), take: vi.fn() },
  };
}

// Partial mock: createRun/CreateRunRequestSchema must stay real (that's what these
// tests exercise); only getServerRuntime is replaced with a per-test fake runtime.
vi.mock(import('@/modules/01-orchestrator'), async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, getServerRuntime: vi.fn() };
});

async function loadPostWithRuntime(runtime: ReturnType<typeof mockRuntime>) {
  const { getServerRuntime } = await import('@/modules/01-orchestrator');
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

  it('returns 201 fast, with a streamUrl, and stashes pending context for an intent that needs retrieval', async () => {
    const respond = vi.fn().mockResolvedValue(fakeRespondResult({ intent: 'algorithm', confidence: 'high' }));
    const metaClient: MetaClient = { respond, listModels: vi.fn() };
    const runtime = mockRuntime(metaClient);
    const POST = await loadPostWithRuntime(runtime);

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
    expect(json.streamUrl).toBe(`/api/runs/${json.runId}/stream`);
    // Only one respond() call (routing) — this handler must not run structure/plan/
    // retrieve/classify/extract itself anymore; that is the SSE route's job.
    expect(respond).toHaveBeenCalledTimes(1);
    expect(runtime.pendingRunContext.put).toHaveBeenCalledWith(
      json.runId,
      expect.objectContaining({ freeText: 'What is first-line treatment for suspected ACS?' }),
    );
  });

  it('does not stash pending context or set streamUrl for an out_of_scope (abstained) result', async () => {
    const respond = vi
      .fn()
      .mockResolvedValue(fakeRespondResult({ intent: 'out_of_scope', confidence: 'high', reject: { reason: 'x' } }));
    const metaClient: MetaClient = { respond, listModels: vi.fn() };
    const runtime = mockRuntime(metaClient);
    const POST = await loadPostWithRuntime(runtime);

    const res = await POST(
      new Request('http://localhost/api/runs', { method: 'POST', body: JSON.stringify({ freeText: 'x', userId: null }) }),
    );
    const json = await res.json();
    expect(json.streamUrl).toBeUndefined();
    expect(runtime.pendingRunContext.put).not.toHaveBeenCalled();
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
