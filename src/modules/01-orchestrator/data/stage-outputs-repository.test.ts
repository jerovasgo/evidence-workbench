import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import { createSupabaseStageOutputsRepository } from './stage-outputs-repository';

function fakeInsertClient(error: unknown = null) {
  const insert = vi.fn().mockResolvedValue({ error });
  const from = vi.fn().mockReturnValue({ insert });
  return { client: { from } as unknown as SupabaseClient, from, insert };
}

function fakeSelectClient(data: unknown, error: unknown = null) {
  const order = vi.fn().mockResolvedValue({ data, error });
  const eq = vi.fn().mockReturnValue({ order });
  const select = vi.fn().mockReturnValue({ eq });
  const from = vi.fn().mockReturnValue({ select });
  return { client: { from } as unknown as SupabaseClient, from, select, eq, order };
}

describe('createSupabaseStageOutputsRepository.insert', () => {
  it('inserts the value/reasons bundled into payload_ref', async () => {
    const { client, from, insert } = fakeInsertClient();
    const repo = createSupabaseStageOutputsRepository(client);

    await repo.insert({
      runId: 'run_1',
      stage: 'structure',
      status: 'ok',
      value: { setting: 'emergency' },
      metrics: { ms: 100, costUsd: 0.01 },
    });

    expect(from).toHaveBeenCalledWith('stage_outputs');
    expect(insert).toHaveBeenCalledWith({
      run_id: 'run_1',
      stage: 'structure',
      status: 'ok',
      payload_ref: { value: { setting: 'emergency' }, reasons: undefined },
      metrics: { ms: 100, costUsd: 0.01 },
    });
  });

  it('throws with the Postgres error message on failure', async () => {
    const { client } = fakeInsertClient({ message: 'violates check constraint' });
    const repo = createSupabaseStageOutputsRepository(client);

    await expect(
      repo.insert({ runId: 'run_1', stage: 'structure', status: 'ok', metrics: { ms: 0, costUsd: 0 } }),
    ).rejects.toThrow(/violates check constraint/);
  });
});

describe('createSupabaseStageOutputsRepository.getLatestPerStage', () => {
  it('keeps only the most recent row per stage', async () => {
    const rows = [
      { stage: 'plan', status: 'ok', payload_ref: { value: { queries: ['v2'] } }, metrics: { ms: 1, costUsd: 0 }, created_at: '2026-10-28T00:02:00Z' },
      { stage: 'plan', status: 'failed', payload_ref: null, metrics: { ms: 1, costUsd: 0 }, created_at: '2026-10-28T00:01:00Z' },
      { stage: 'structure', status: 'ok', payload_ref: { value: { setting: 'emergency' } }, metrics: { ms: 1, costUsd: 0 }, created_at: '2026-10-28T00:00:00Z' },
    ];
    const { client } = fakeSelectClient(rows);
    const repo = createSupabaseStageOutputsRepository(client);

    const result = await repo.getLatestPerStage('run_1');

    expect(result.size).toBe(2);
    expect(result.get('plan')).toMatchObject({ status: 'ok', value: { queries: ['v2'] } });
    expect(result.get('structure')).toMatchObject({ status: 'ok', value: { setting: 'emergency' } });
  });

  it('returns an empty map when the run has no stage outputs yet', async () => {
    const { client } = fakeSelectClient([]);
    const repo = createSupabaseStageOutputsRepository(client);
    expect((await repo.getLatestPerStage('run_1')).size).toBe(0);
  });

  it('throws on a Postgres error', async () => {
    const { client } = fakeSelectClient(null, { message: 'connection reset' });
    const repo = createSupabaseStageOutputsRepository(client);
    await expect(repo.getLatestPerStage('run_1')).rejects.toThrow(/connection reset/);
  });
});
