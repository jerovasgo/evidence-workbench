import { describe, expect, it } from 'vitest';
import { createPendingRunContextStore } from './pending-run-context';

describe('createPendingRunContextStore', () => {
  it('returns null for a runId that was never put', async () => {
    const store = createPendingRunContextStore();
    expect(await store.take('missing')).toBeNull();
  });

  it('returns the stashed context once', async () => {
    const store = createPendingRunContextStore();
    await store.put('run_1', { freeText: 'x' });

    expect(await store.take('run_1')).toEqual({ freeText: 'x' });
    expect(await store.take('run_1')).toBeNull(); // single use
  });

  it('expires an entry past its TTL', async () => {
    let clock = 0;
    const store = createPendingRunContextStore(1000, () => clock);
    await store.put('run_1', { freeText: 'x' });

    clock = 1001;
    expect(await store.take('run_1')).toBeNull();
  });

  it('keeps an entry available right up to its TTL', async () => {
    let clock = 0;
    const store = createPendingRunContextStore(1000, () => clock);
    await store.put('run_1', { freeText: 'x' });

    clock = 999;
    expect(await store.take('run_1')).toEqual({ freeText: 'x' });
  });
});
