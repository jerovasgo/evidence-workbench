// Module 10 build note: "Add the budget guard to the agent harness (01) before any real
// model call." This is the Day-1 in-memory implementation; a later stage swaps the
// ledger for the Postgres-backed one (budget_ledger table) without changing this
// interface, so runAgent never needs to know which backing store it is talking to.

export interface BudgetGuardConfig {
  runCostCapUsd: number;
  dailyBudgetUsd: number;
  concordanceReserveUsd?: number;
}

export type BudgetDenialReason = 'run_cap_exceeded' | 'daily_budget_exceeded';

export type BudgetCheckResult = { allowed: true } | { allowed: false; reason: BudgetDenialReason };

export interface BudgetGuard {
  /** Call before spending; denies if the estimated cost would exceed either cap. */
  check(runId: string, estimatedCostUsd: number): BudgetCheckResult;
  /** Call after a call completes, with its real cost, to update both ledgers. */
  record(runId: string, actualCostUsd: number): void;
  spentForRun(runId: string): number;
  spentToday(): number;
  reserveCall?(runId: string, amount: number, concordance: boolean): (() => void) | null;
}

/**
 * In-memory budget guard, scoped to one process. `dailyBudgetUsd` resets only when the
 * process restarts — acceptable for a single-instance hackathon deploy, not for
 * multi-instance production (that needs the shared Postgres ledger from module 10).
 */
export function createInMemoryBudgetGuard(config: BudgetGuardConfig): BudgetGuard {
  const spendByRun = new Map<string, number>();
  let spentToday = 0;
  const held = new Map<string, number>();
  let heldToday = 0;

  const guard: BudgetGuard = {
    check(runId, estimatedCostUsd) {
      const spentOnRun = spendByRun.get(runId) ?? 0;
      if (spentOnRun + (held.get(runId) ?? 0) + estimatedCostUsd + (config.concordanceReserveUsd ?? 0) > config.runCostCapUsd) {
        return { allowed: false, reason: 'run_cap_exceeded' };
      }
      if (spentToday + heldToday + estimatedCostUsd > config.dailyBudgetUsd) {
        return { allowed: false, reason: 'daily_budget_exceeded' };
      }
      return { allowed: true };
    },
    reserveCall(runId, amount, concordance) {
      const reserve = concordance ? 0 : (config.concordanceReserveUsd ?? 0);
      if ((spendByRun.get(runId) ?? 0) + (held.get(runId) ?? 0) + amount + reserve > config.runCostCapUsd || spentToday + heldToday + amount > config.dailyBudgetUsd) return null;
      held.set(runId, (held.get(runId) ?? 0) + amount); heldToday += amount;
      let released = false;
      return () => { if (released) return; released = true; held.set(runId, (held.get(runId) ?? 0) - amount); heldToday -= amount; };
    },
    record(runId, actualCostUsd) {
      spendByRun.set(runId, (spendByRun.get(runId) ?? 0) + actualCostUsd);
      spentToday += actualCostUsd;
    },
    spentForRun(runId) {
      return spendByRun.get(runId) ?? 0;
    },
    spentToday() {
      return spentToday;
    },
  };
  return guard;
}
