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

async function loadRouteWithRuntime(runtime: { conversationsRepository: unknown }) {
  const { getServerRuntime } = await import('@/modules/01-orchestrator');
  vi.mocked(getServerRuntime).mockReturnValue(runtime as never);
  return import('./route');
}

const params = Promise.resolve({ id: 'c1' });

describe('GET /api/conversations/[id]', () => {
  it('returns the conversation with its decrypted turns', async () => {
    const getWithTurns = vi.fn(async () => ({ conversation: { id: 'c1', title: 'x' }, turns: [{ id: 't1', freeText: 'hello' }] }));
    const { GET } = await loadRouteWithRuntime({ conversationsRepository: { getWithTurns } });

    const res = await GET(new Request('http://localhost/api/conversations/c1'), { params });
    const json = await res.json();

    expect(getWithTurns).toHaveBeenCalledWith('c1', 'session_1');
    expect(res.status).toBe(200);
    expect(json.turns[0].freeText).toBe('hello');
  });

  it('returns 404 when the conversation does not belong to this session', async () => {
    const getWithTurns = vi.fn(async () => null);
    const { GET } = await loadRouteWithRuntime({ conversationsRepository: { getWithTurns } });

    const res = await GET(new Request('http://localhost/api/conversations/c1'), { params });
    expect(res.status).toBe(404);
  });
});

describe('PATCH /api/conversations/[id]', () => {
  it('renames the conversation', async () => {
    const rename = vi.fn(async () => true);
    const { PATCH } = await loadRouteWithRuntime({ conversationsRepository: { rename } });

    const res = await PATCH(
      new Request('http://localhost/api/conversations/c1', { method: 'PATCH', body: JSON.stringify({ title: 'New title' }) }),
      { params },
    );

    expect(rename).toHaveBeenCalledWith('c1', 'session_1', 'New title');
    expect(res.status).toBe(200);
  });

  it('returns 400 for an empty title', async () => {
    const rename = vi.fn();
    const { PATCH } = await loadRouteWithRuntime({ conversationsRepository: { rename } });

    const res = await PATCH(
      new Request('http://localhost/api/conversations/c1', { method: 'PATCH', body: JSON.stringify({ title: '' }) }),
      { params },
    );

    expect(res.status).toBe(400);
    expect(rename).not.toHaveBeenCalled();
  });
});

describe('DELETE /api/conversations/[id]', () => {
  it('deletes the conversation', async () => {
    const remove = vi.fn(async () => true);
    const { DELETE } = await loadRouteWithRuntime({ conversationsRepository: { remove } });

    const res = await DELETE(new Request('http://localhost/api/conversations/c1', { method: 'DELETE' }), { params });

    expect(remove).toHaveBeenCalledWith('c1', 'session_1');
    expect(res.status).toBe(200);
  });

  it('returns 404 when nothing was deleted', async () => {
    const remove = vi.fn(async () => false);
    const { DELETE } = await loadRouteWithRuntime({ conversationsRepository: { remove } });

    const res = await DELETE(new Request('http://localhost/api/conversations/c1', { method: 'DELETE' }), { params });
    expect(res.status).toBe(404);
  });
});
