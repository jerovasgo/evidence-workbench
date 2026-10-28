import { describe, expect, it, vi } from 'vitest';

vi.mock('next/headers', () => {
  const store = new Map<string, string>();
  store.set('ewb_session', 'session_1');
  return {
    cookies: vi.fn(async () => ({
      get: (name: string) => (store.has(name) ? { name, value: store.get(name)! } : undefined),
      set: (name: string, value: string) => store.set(name, value),
    })),
  };
});

vi.mock(import('@/modules/01-orchestrator'), async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, getServerRuntime: vi.fn() };
});

async function loadGetWithRuntime(runtime: { conversationsRepository: unknown }) {
  const { getServerRuntime } = await import('@/modules/01-orchestrator');
  vi.mocked(getServerRuntime).mockReturnValue(runtime as never);
  const { GET } = await import('./route');
  return GET;
}

describe('GET /api/conversations', () => {
  it("returns the caller's conversations scoped to their session", async () => {
    const listForSession = vi.fn(async (sessionId: string) => [{ id: 'c1', title: 'x', mode: 'auto', createdAt: 't', updatedAt: 't', sessionId }]);
    const GET = await loadGetWithRuntime({ conversationsRepository: { listForSession } });

    const res = await GET();
    const json = await res.json();

    expect(listForSession).toHaveBeenCalledWith('session_1');
    expect(json.conversations).toHaveLength(1);
  });
});
