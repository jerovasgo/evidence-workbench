// Module 01: scenario text is never persisted by default (AGENTS.md rule 3), so the
// SSE endpoint (`GET /api/runs/:id/stream`) that actually runs structure/plan/
// retrieve/extract/verify can't recover the free text from the `runs` table alone.
// POST /api/runs stashes it here, keyed by the new run's id, for the stream to pick
// up once, immediately after — a short-lived handoff between two calls of the SAME
// request flow, not a durable store.
//
// The *interface* is async because the production implementation is Supabase-backed
// (`src/modules/01-orchestrator/data/pending-run-store.ts`), not in-memory: Vercel's
// serverless functions give no guarantee the POST and the immediately-following GET
// land on the same process, so an in-memory `Map` here silently drops the handoff —
// this was the exact cause of "Retrieval context is no longer available" live in
// production (docs/DECISIONS.md, 2026-10-31). This in-memory factory still exists
// for tests and local dev that don't want to hit Supabase; its behavior (single-use,
// TTL'd) is unchanged, just wrapped to return Promises so both implementations share
// one interface.

export interface PendingRunContext {
  freeText: string;
  originalFreeText?: string;
  conversationId?: string;
  depth?: import('@/lib/research-depth').ResearchDepth;
  routerCondition?: string;
  routerSetting?: string;
  opening?: string;
}

export interface PendingRunContextStore {
  put(runId: string, context: PendingRunContext): Promise<void>;
  /** Removes and returns the context, or null if absent/expired — single use. */
  take(runId: string): Promise<PendingRunContext | null>;
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
    async put(runId, context) {
      entries.set(runId, { context, expiresAt: now() + ttlMs });
    },
    async take(runId) {
      const entry = entries.get(runId);
      if (!entry) return null;
      entries.delete(runId);
      if (entry.expiresAt <= now()) return null;
      return entry.context;
    },
  };
}
