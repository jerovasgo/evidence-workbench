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
  /**
   * `isReserveHolder` (2026-11-02, docs/DECISIONS.md): true only for the call this
   * run's own `setIntentReserve` amount was set aside for (today: algorithm/mechanism
   * synthesis) — exempts that call from its own reserve, the same way `concordance`
   * already exempts the relation-labeller from the concordance reserve. Every other
   * call on the run (extraction, verification, ...) is blocked from spending into it.
   */
  reserveCall?(runId: string, amount: number, concordance: boolean, isReserveHolder?: boolean): (() => void) | null;
  /**
   * Reserves `amountUsd` of this run's own cost cap for its primary requested view's
   * synthesis call (algorithm/mechanism), held back from every other call on the run
   * — so extraction/verification can never spend what the view the user actually
   * asked for needs (2026-11-02, docs/DECISIONS.md: root cause of "Insufficient
   * unreserved budget" always appearing for an Algorithm/Mechanism request — that
   * agent ran last and competed for leftover budget against an unbounded number of
   * earlier extraction/verification calls). Call once, before extraction starts. A
   * run with no reserve set behaves exactly as before.
   */
  setIntentReserve?(runId: string, amountUsd: number): void;
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
  const intentReserve = new Map<string, number>();

  const guard: BudgetGuard = {
    check(runId, estimatedCostUsd) {
      const spentOnRun = spendByRun.get(runId) ?? 0;
      const reserve = (config.concordanceReserveUsd ?? 0) + (intentReserve.get(runId) ?? 0);
      if (spentOnRun + (held.get(runId) ?? 0) + estimatedCostUsd + reserve > config.runCostCapUsd) {
        return { allowed: false, reason: 'run_cap_exceeded' };
      }
      if (spentToday + heldToday + estimatedCostUsd > config.dailyBudgetUsd) {
        return { allowed: false, reason: 'daily_budget_exceeded' };
      }
      return { allowed: true };
    },
    reserveCall(runId, amount, concordance, isReserveHolder = false) {
      const concordanceReserve = concordance ? 0 : (config.concordanceReserveUsd ?? 0);
      const intentReserveAmount = isReserveHolder ? 0 : (intentReserve.get(runId) ?? 0);
      const reserve = concordanceReserve + intentReserveAmount;
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
    setIntentReserve(runId, amountUsd) {
      intentReserve.set(runId, amountUsd);
    },
  };
  return guard;
}
