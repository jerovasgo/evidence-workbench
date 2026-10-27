import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import { createSupabaseRunsRepository } from './runs-repository';

const sampleRow = {
  id: 'run_1',
  user_id: null,
  is_precomputed: true,
  intent: 'algorithm',
  status: 'queued' as const,
  created_at: '2026-10-27T00:00:00.000Z',
};

function fakeInsertClient(data: unknown, error: unknown = null) {
  const single = vi.fn().mockResolvedValue({ data, error });
  const select = vi.fn().mockReturnValue({ single });
  const insert = vi.fn().mockReturnValue({ select });
  const from = vi.fn().mockReturnValue({ insert });
  return { client: { from } as unknown as SupabaseClient, from, insert, select, single };
}

function fakeSelectClient(data: unknown, error: unknown = null) {
  const maybeSingle = vi.fn().mockResolvedValue({ data, error });
  const eq = vi.fn().mockReturnValue({ maybeSingle });
  const select = vi.fn().mockReturnValue({ eq });
  const from = vi.fn().mockReturnValue({ select });
  return { client: { from } as unknown as SupabaseClient, from, select, eq, maybeSingle };
}

describe('createSupabaseRunsRepository.createRun', () => {
  it('inserts snake_case columns and maps the returned row back to RunRecord', async () => {
    const { client, from, insert } = fakeInsertClient(sampleRow);
    const repo = createSupabaseRunsRepository(client);

    const result = await repo.createRun({ userId: null, isPrecomputed: true, intent: 'algorithm', status: 'queued' });

    expect(from).toHaveBeenCalledWith('runs');
    expect(insert).toHaveBeenCalledWith({
      user_id: null,
      is_precomputed: true,
      intent: 'algorithm',
      status: 'queued',
    });
    expect(result).toEqual({
      id: 'run_1',
      userId: null,
      isPrecomputed: true,
      intent: 'algorithm',
      status: 'queued',
      createdAt: '2026-10-27T00:00:00.000Z',
    });
  });

  it('throws with the Postgres error message on failure', async () => {
    const { client } = fakeInsertClient(null, { message: 'insert or update on table violates foreign key' });
    const repo = createSupabaseRunsRepository(client);

    await expect(
      repo.createRun({ userId: 'u1', isPrecomputed: false, intent: 'algorithm', status: 'queued' }),
    ).rejects.toThrow(/violates foreign key/);
  });
});

describe('createSupabaseRunsRepository.getRun', () => {
  it('returns the mapped run when found', async () => {
    const { client } = fakeSelectClient(sampleRow);
    const repo = createSupabaseRunsRepository(client);

    const result = await repo.getRun('run_1');
    expect(result?.id).toBe('run_1');
  });

  it('returns null when no row matches', async () => {
    const { client } = fakeSelectClient(null);
    const repo = createSupabaseRunsRepository(client);

    expect(await repo.getRun('missing')).toBeNull();
  });

  it('throws on a Postgres error', async () => {
    const { client } = fakeSelectClient(null, { message: 'connection reset' });
    const repo = createSupabaseRunsRepository(client);

    await expect(repo.getRun('run_1')).rejects.toThrow(/connection reset/);
  });
});
