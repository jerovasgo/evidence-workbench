import { describe, expect, it } from 'vitest';
import { createInMemoryBudgetGuard } from './budget-guard';

describe('createInMemoryBudgetGuard', () => {
  it('allows spending under both the per-run cap and the daily budget', () => {
    const guard = createInMemoryBudgetGuard({ runCostCapUsd: 0.4, dailyBudgetUsd: 20 });
    expect(guard.check('run_1', 0.1)).toEqual({ allowed: true });
  });

  it('denies a call that would exceed the per-run cost cap', () => {
    const guard = createInMemoryBudgetGuard({ runCostCapUsd: 0.4, dailyBudgetUsd: 20 });
    guard.record('run_1', 0.35);
    expect(guard.check('run_1', 0.1)).toEqual({ allowed: false, reason: 'run_cap_exceeded' });
  });

  it('denies a call that would exceed the daily budget even if the run cap allows it', () => {
    const guard = createInMemoryBudgetGuard({ runCostCapUsd: 10, dailyBudgetUsd: 1 });
    guard.record('run_1', 0.9);
    expect(guard.check('run_2', 0.5)).toEqual({ allowed: false, reason: 'daily_budget_exceeded' });
  });

  it('tracks spend per run independently', () => {
    const guard = createInMemoryBudgetGuard({ runCostCapUsd: 0.4, dailyBudgetUsd: 20 });
    guard.record('run_1', 0.3);
    guard.record('run_2', 0.3);
    expect(guard.spentForRun('run_1')).toBeCloseTo(0.3, 6);
    expect(guard.spentForRun('run_2')).toBeCloseTo(0.3, 6);
    expect(guard.spentToday()).toBeCloseTo(0.6, 6);
  });
});
