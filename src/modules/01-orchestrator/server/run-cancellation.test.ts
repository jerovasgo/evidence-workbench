import { describe, expect, it } from 'vitest';
import { cancelRun, registerRun, throwIfCancelled, unregisterRun, RunCancelledError } from './run-cancellation';

describe('run-cancellation registry', () => {
  it('cancelRun aborts the controller registered for that run', () => {
    const controller = registerRun('run_1');
    expect(controller.signal.aborted).toBe(false);
    expect(cancelRun('run_1')).toBe(true);
    expect(controller.signal.aborted).toBe(true);
  });

  it('cancelRun returns false for a run that was never registered', () => {
    expect(cancelRun('never_registered')).toBe(false);
  });

  it('cancelRun is idempotent (calling it twice does not throw)', () => {
    registerRun('run_2');
    expect(cancelRun('run_2')).toBe(true);
    expect(() => cancelRun('run_2')).not.toThrow();
  });

  it('unregisterRun removes the entry so a later cancelRun returns false', () => {
    registerRun('run_3');
    unregisterRun('run_3');
    expect(cancelRun('run_3')).toBe(false);
  });

  it('throwIfCancelled throws RunCancelledError only when the signal is aborted', () => {
    const controller = registerRun('run_4');
    expect(() => throwIfCancelled('run_4', controller.signal)).not.toThrow();
    cancelRun('run_4');
    expect(() => throwIfCancelled('run_4', controller.signal)).toThrow(RunCancelledError);
  });

  it('throwIfCancelled is a no-op when no signal is passed', () => {
    expect(() => throwIfCancelled('run_5', undefined)).not.toThrow();
  });
});
