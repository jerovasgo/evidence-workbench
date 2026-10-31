import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import { createSingleKeyKeyring } from '@/shared/security';
import { createSupabasePendingRunContextStore } from './pending-run-store';

const keyring = createSingleKeyKeyring(Buffer.alloc(32, 3));

/** Minimal fake covering only what this repository's queries need: upsert/select/delete,
 *  `.eq('run_id', …)` and `.lt('created_at', …)` filters. Rows can be seeded directly
 *  (with an arbitrary `created_at`) to test the sweep without mocking `Date.now()`. */
function fakeClient() {
  const rows = new Map<string, { run_id: string; encrypted_context: unknown; created_at: string }>();

  function makeQuery() {
    let filtered = [...rows.values()];
    const chain = {
      select: vi.fn(() => chain),
      upsert: vi.fn((row: { run_id: string; encrypted_context: unknown }) => {
        rows.set(row.run_id, { ...row, created_at: new Date().toISOString() });
        return Promise.resolve({ error: null });
      }),
      delete: vi.fn(() => chain),
      eq: vi.fn((key: string, value: unknown) => {
        filtered = filtered.filter((row) => (row as unknown as Record<string, unknown>)[key] === value);
        if (key === 'run_id') rows.delete(value as string); // only this repo's delete-by-eq path
        return chain;
      }),
      lt: vi.fn((_key: 'created_at', value: string) => {
        for (const row of [...rows.values()]) {
          if (row.created_at < value) rows.delete(row.run_id);
        }
        return Promise.resolve({ error: null });
      }),
      maybeSingle: vi.fn(() => Promise.resolve({ data: filtered[0] ?? null, error: null })),
      then: (resolve: (v: { error: null }) => void) => resolve({ error: null }),
    };
    return chain;
  }

  const client = { from: vi.fn(() => makeQuery()) } as unknown as SupabaseClient;
  return { client, rows };
}

describe('createSupabasePendingRunContextStore', () => {
  it('round-trips a context: put then take returns the same data', async () => {
    const { client } = fakeClient();
    const store = createSupabasePendingRunContextStore(client, keyring);

    await store.put('run_1', { freeText: 'What is the role of BRCA1?', depth: 'quick' });
    expect(await store.take('run_1')).toEqual({ freeText: 'What is the role of BRCA1?', depth: 'quick' });
  });

  it('is single-use: a second take returns null', async () => {
    const { client } = fakeClient();
    const store = createSupabasePendingRunContextStore(client, keyring);

    await store.put('run_1', { freeText: 'x' });
    await store.take('run_1');
    expect(await store.take('run_1')).toBeNull();
  });

  it('returns null for a run that was never put', async () => {
    const { client } = fakeClient();
    const store = createSupabasePendingRunContextStore(client, keyring);

    expect(await store.take('missing')).toBeNull();
  });

  it('sweeps rows older than an hour on the next put, without touching fresh ones', async () => {
    const { client, rows } = fakeClient();
    rows.set('stale_run', { run_id: 'stale_run', encrypted_context: {}, created_at: new Date(Date.now() - 61 * 60 * 1000).toISOString() });
    const store = createSupabasePendingRunContextStore(client, keyring);

    await store.put('fresh_run', { freeText: 'new' });

    expect(rows.has('stale_run')).toBe(false);
    expect(rows.has('fresh_run')).toBe(true);
  });
});
