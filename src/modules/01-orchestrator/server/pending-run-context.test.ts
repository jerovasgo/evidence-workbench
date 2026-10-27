import { describe, expect, it } from 'vitest';
import { createPendingRunContextStore } from './pending-run-context';

describe('createPendingRunContextStore', () => {
  it('returns null for a runId that was never put', () => {
    const store = createPendingRunContextStore();
    expect(store.take('missing')).toBeNull();
  });

  it('returns the stashed context once', () => {
    const store = createPendingRunContextStore();
    store.put('run_1', { freeText: 'x' });

    expect(store.take('run_1')).toEqual({ freeText: 'x' });
    expect(store.take('run_1')).toBeNull(); // single use
  });

  it('expires an entry past its TTL', () => {
    let clock = 0;
    const store = createPendingRunContextStore(1000, () => clock);
    store.put('run_1', { freeText: 'x' });

    clock = 1001;
    expect(store.take('run_1')).toBeNull();
  });

  it('keeps an entry available right up to its TTL', () => {
    let clock = 0;
    const store = createPendingRunContextStore(1000, () => clock);
    store.put('run_1', { freeText: 'x' });

    clock = 999;
    expect(store.take('run_1')).toEqual({ freeText: 'x' });
  });
});
