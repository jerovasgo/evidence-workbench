import { cancelRun, getRunForViewer, getServerRuntime } from '@/modules/01-orchestrator';

// 2026-11-02 (docs/DECISIONS.md): real cancellation, trigger side. Two triggers
// converge here: an explicit Stop click (`fetch(..., { method: 'DELETE' })`) and a
// refresh/tab-close/unmount while still streaming (`navigator.sendBeacon`, which can
// only ever send POST) — both just need `cancelRun` to fire once, so one handler
// serves both methods. The actual abort (`AbortController.abort()`) interrupts the
// stream route's in-flight pipeline; this route itself holds no pipeline state.

async function handleCancel(_request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await context.params;
  const runtime = getServerRuntime();

  const runOutcome = await getRunForViewer(id, null, runtime);
  if (runOutcome.status === 'not_found') return Response.json({ error: 'Run not found' }, { status: 404 });
  if (runOutcome.status === 'forbidden') return Response.json({ error: 'Not authorized to cancel this run' }, { status: 403 });

  const wasRunning = cancelRun(id);
  runtime.budgetGuard.cancelRun?.(id);
  return Response.json({ cancelled: wasRunning });
}

export const DELETE = handleCancel;
export const POST = handleCancel;
