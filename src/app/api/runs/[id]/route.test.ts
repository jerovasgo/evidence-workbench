import { describe, expect, it, vi } from 'vitest';
import type { RunRecord, RunsRepository } from '@/modules/01-orchestrator';

// Partial mock: getRunForViewer must stay real (that's what these tests exercise);
// only getServerRuntime is replaced with a per-test fake repository.
vi.mock(import('@/modules/01-orchestrator'), async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, getServerRuntime: vi.fn() };
});

async function loadGetWithRepository(runsRepository: RunsRepository) {
  const { getServerRuntime } = await import('@/modules/01-orchestrator');
  vi.mocked(getServerRuntime).mockReturnValue({ runsRepository } as never);
  const { GET } = await import('./route');
  return GET;
}

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

describe('GET /api/runs/[id]', () => {
  it('returns 404 when the run does not exist', async () => {
    const GET = await loadGetWithRepository({ createRun: vi.fn(), getRun: vi.fn(async () => null), updateRunStatus: vi.fn() });
    const res = await GET(new Request('http://localhost/api/runs/missing'), { params: Promise.resolve({ id: 'missing' }) });
    expect(res.status).toBe(404);
  });

  it('returns 200 for a precomputed run (every anonymous viewer can read it)', async () => {
    const GET = await loadGetWithRepository({ createRun: vi.fn(), getRun: vi.fn(async () => precomputedRun), updateRunStatus: vi.fn() });
    const res = await GET(new Request('http://localhost/api/runs/run_1'), { params: Promise.resolve({ id: 'run_1' }) });
    expect(res.status).toBe(200);
    expect((await res.json()).run.id).toBe('run_1');
  });

  it('returns 403 for a private run, since no auth is wired yet and the viewer is always anonymous', async () => {
    const GET = await loadGetWithRepository({ createRun: vi.fn(), getRun: vi.fn(async () => privateRun), updateRunStatus: vi.fn() });
    const res = await GET(new Request('http://localhost/api/runs/run_2'), { params: Promise.resolve({ id: 'run_2' }) });
    expect(res.status).toBe(403);
  });
});
