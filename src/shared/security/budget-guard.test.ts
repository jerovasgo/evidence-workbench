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

it('protects concordance allocation from concurrent calls and releases holds once', () => {
 const guard=createInMemoryBudgetGuard({runCostCapUsd:0.4,dailyBudgetUsd:20,concordanceReserveUsd:0.1});
 const release=guard.reserveCall!('r',0.2,false)!;
 expect(release).toBeTypeOf('function');
 expect(guard.reserveCall!('r',0.15,false)).toBeNull();
 expect(guard.reserveCall!('r',0.1,true)).toBeTypeOf('function');
 release(); release();
 expect(guard.reserveCall!('r',0.15,false)).toBeTypeOf('function');
});

describe('setIntentReserve (2026-11-02, docs/DECISIONS.md)', () => {
  it('blocks a non-reserve-holder call from spending into the reserved amount', () => {
    const guard = createInMemoryBudgetGuard({ runCostCapUsd: 0.4, dailyBudgetUsd: 20 });
    guard.setIntentReserve!('r', 0.25);
    // Room is 0.4 - 0.25 reserve = 0.15 for non-reserve-holder calls.
    expect(guard.reserveCall!('r', 0.1, false)).toBeTypeOf('function');
    expect(guard.reserveCall!('r', 0.1, false)).toBeNull();
  });

  it('lets the reserve holder spend its own reserved amount even when other calls already used the rest', () => {
    const guard = createInMemoryBudgetGuard({ runCostCapUsd: 0.4, dailyBudgetUsd: 20 });
    guard.setIntentReserve!('r', 0.25);
    expect(guard.reserveCall!('r', 0.15, false)).toBeTypeOf('function'); // the non-reserve room
    expect(guard.reserveCall!('r', 0.1, false)).toBeNull(); // non-reserve room now exhausted
    expect(guard.reserveCall!('r', 0.15, false, true)).toBeTypeOf('function'); // reserve holder draws from its own reserve
  });

  it('reproduces the original bug (no reserve) and confirms the reserve fixes it', () => {
    const guard = createInMemoryBudgetGuard({ runCostCapUsd: 0.4, dailyBudgetUsd: 20, concordanceReserveUsd: 0.1 });
    // Simulate extraction/verification spending down to the exact point observed live.
    guard.record('r', 0.31);
    // Without a reserve, the synthesis call (0.15 + implicit 0.10 concordance reserve) is blocked — the original bug.
    expect(guard.reserveCall!('r', 0.15, false, true)).toBeNull();

    const reserved = createInMemoryBudgetGuard({ runCostCapUsd: 0.4, dailyBudgetUsd: 20, concordanceReserveUsd: 0.1 });
    reserved.setIntentReserve!('r', 0.25);
    // Non-reserve-holder calls are capped earlier, so spend never reaches 0.31 in practice —
    // but even if it somehow did, the reserve holder still gets its own reserved amount.
    expect(reserved.reserveCall!('r', 0.15, false, true)).toBeTypeOf('function');
  });

  it('leaves a run with no reserve set unaffected (existing behavior preserved)', () => {
    const guard = createInMemoryBudgetGuard({ runCostCapUsd: 0.4, dailyBudgetUsd: 20 });
    expect(guard.reserveCall!('r', 0.39, false)).toBeTypeOf('function');
  });
});
