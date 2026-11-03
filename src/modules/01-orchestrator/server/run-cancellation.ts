// 2026-11-02 (docs/DECISIONS.md): an in-memory, per-process cancellation registry —
// same documented single-instance-hackathon-deploy caveat as `budget-guard.ts`'s own
// in-memory store (module 10's own header comment). Before this, closing the
// client's EventSource had zero effect server-side: `GET /api/runs/[id]/stream`
// never even named its `Request` parameter, so nothing listened for a client
// disconnect, and the pipeline ran to full completion (spending the full budget)
// regardless of whether anyone was still watching.

const controllers = new Map<string, AbortController>();

/** Thrown at a loop boundary once a run's signal has been aborted — caught once, at
 *  the top of the SSE route, to send a `'cancelled'` status instead of `'failed'`. */
export class RunCancelledError extends Error {
  constructor(runId: string) {
    super(`Run ${runId} was cancelled`);
    this.name = 'RunCancelledError';
  }
}

/** Call once, when a run's stream starts. Returns the controller whose `.signal`
 *  should be threaded through the pipeline. */
export function registerRun(runId: string): AbortController {
  const controller = new AbortController();
  controllers.set(runId, controller);
  return controller;
}

/** Aborts the run's controller if one is registered. Returns `false` for a run that
 *  already finished (and was unregistered) or was never registered — a stale/late
 *  cancel request is a no-op, never an error. */
export function cancelRun(runId: string): boolean {
  const controller = controllers.get(runId);
  if (!controller) return false;
  if (!controller.signal.aborted) controller.abort();
  return true;
}

/** Call in the stream route's `finally`, once the run is no longer in flight. */
export function unregisterRun(runId: string): void {
  controllers.delete(runId);
}

/** Throws `RunCancelledError` if `signal` is already aborted — call at loop
 *  boundaries (before starting the next source, the next search query, the next
 *  rescue attempt) so new work stops immediately even where a signal hasn't been
 *  threaded into every individual `fetch`/model call yet. */
export function throwIfCancelled(runId: string, signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw new RunCancelledError(runId);
}
