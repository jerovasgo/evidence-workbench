// Module 01: scenario text is never persisted (CLAUDE.md rule 3), so the SSE
// endpoint (`GET /api/runs/:id/stream`) that actually runs structure/plan/retrieve/
// extract/verify can't recover the free text from the `runs` table alone. POST
// /api/runs stashes it here, keyed by the new run's id, for the stream to pick up
// once, immediately after. In-memory per server process only — same documented
// caveat as the budget guard (resets on restart, not shared across instances); if
// the stream never comes (client never connects, or hits a different instance),
// the context just expires unused. This is a short-lived handoff between two calls
// of the SAME request flow, not persistence of scenario text to any store.

export interface PendingRunContext {
  freeText: string;
  routerCondition?: string;
  routerSetting?: string;
}

export interface PendingRunContextStore {
  put(runId: string, context: PendingRunContext): void;
  /** Removes and returns the context, or null if absent/expired — single use. */
  take(runId: string): PendingRunContext | null;
}

interface Entry {
  context: PendingRunContext;
  expiresAt: number;
}

export function createPendingRunContextStore(
  ttlMs = 10 * 60 * 1000,
  now: () => number = Date.now,
): PendingRunContextStore {
  const entries = new Map<string, Entry>();

  return {
    put(runId, context) {
      entries.set(runId, { context, expiresAt: now() + ttlMs });
    },
    take(runId) {
      const entry = entries.get(runId);
      if (!entry) return null;
      entries.delete(runId);
      if (entry.expiresAt <= now()) return null;
      return entry.context;
    },
  };
}
