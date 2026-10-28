import {
  buildReceipt,
  getRunForViewer,
  getServerRuntime,
  runRetrievalPipeline,
  type RunRetrievalResult,
} from '@/modules/01-orchestrator';
import type { RunEvent } from '@/shared/domain';

// Module 01: "GET /api/runs/:id/stream (SSE) <- events as stages complete." This is
// the time-to-first-token path for an interactive run: `POST /api/runs` only routes
// (fast) and stashes the free text in `pendingRunContext`; THIS handler is what
// actually runs structure/plan/retrieve/classify/extract/verify, streaming progress
// as each stage — and each source within `extract` — completes, instead of making
// the client wait for one giant response. A live smoke test showed per-source
// extraction taking ~9-10s each; streaming means the client sees the first
// `stage_started` almost immediately and per-source progress every ~9-10s rather
// than one ~30s+ silence.
//
// Why a separate GET after POST, not one streaming POST: module 01's own design
// (multiple viewers could reconnect to the same run; a resumable/persisted run can
// be watched without re-running it from scratch). Scenario text is never persisted
// (CLAUDE.md rule 3), so a reconnect after `pendingRunContext` has been consumed (or
// the server restarted) can't recover the ORIGINAL free text — but `stage_outputs`
// persistence (module 01's resumable-run design, wired in 2026-10-28) means that
// only matters for whichever stage hasn't completed yet: a resumed run with
// `structure` and `plan` already persisted skips straight to `retrieve` without
// needing free text at all, since neither stage used it directly. Only a run that
// never got past routing (no stage output exists yet) and lost its pending context
// truly has nothing to resume — that case alone gets the `error` event below.
//
// `band_ready`'s "red-flag/first-action claims first" ordering (module 01) is
// approximated here, not implemented in full: nothing tags claims as red-flag/
// first-action yet (that needs the algorithm graph, module 06, not built), so this
// route emits one `band_ready` with every verified(-pending-support) claim once
// `extract` finishes, prioritized only by evidence kind (`extract-and-verify-pool.ts`'s
// guideline > systematic_review > RCT ordering) — an honest, documented
// simplification of the real design, not the real thing.

function sseFrame(event: RunEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

function computeFinalStatus(result: RunRetrievalResult): 'done' | 'partial' | 'failed' {
  if (result.extraction.status === 'ok') return 'done';
  if ((result.extraction.value?.length ?? 0) > 0) return 'partial';
  if (result.structure.status === 'failed' && result.plan.status === 'failed') return 'failed';
  return 'partial';
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await context.params;
  const runtime = getServerRuntime();

  const runOutcome = await getRunForViewer(id, null, runtime);
  if (runOutcome.status === 'not_found') return Response.json({ error: 'Run not found' }, { status: 404 });
  if (runOutcome.status === 'forbidden') return Response.json({ error: 'Not authorized to view this run' }, { status: 403 });

  const run = runOutcome.run;
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: RunEvent) => controller.enqueue(encoder.encode(sseFrame(event)));

      // A reconnect after the run already finished: nothing to stream, just report
      // the terminal state once (module 01: "results retrievable by run id").
      if (run.status === 'done' || run.status === 'partial' || run.status === 'abstained' || run.status === 'failed') {
        send({ type: 'done', runId: run.id, status: run.status });
        controller.close();
        return;
      }

      const pending = runtime.pendingRunContext.take(run.id);

      // No in-memory context: only an actual blocker if nothing was persisted
      // either — otherwise this is exactly the resumable-reconnect case stage
      // persistence exists for, and the pipeline's own resume logic picks up from
      // whichever stage last completed.
      if (!pending) {
        const alreadyPersisted = await runtime.stageOutputsRepository.getLatestPerStage(run.id).catch(() => new Map());
        if (alreadyPersisted.size === 0) {
          send({
            type: 'error',
            runId: run.id,
            message: 'Retrieval context is no longer available for this run (never started streaming, or expired before it could). Start a new run.',
          });
          send({ type: 'done', runId: run.id, status: 'failed' });
          controller.close();
          return;
        }
      }

      try {
        const result = await runRetrievalPipeline(
          { runId: run.id, freeText: pending?.freeText ?? '', routerCondition: pending?.routerCondition, routerSetting: pending?.routerSetting },
          {
            metaClient: runtime.metaClient,
            budgetGuard: runtime.budgetGuard,
            crossref: runtime.crossref,
            stageOutputs: runtime.stageOutputsRepository,
            p0Preamble: runtime.p0Preamble,
            p2PromptTemplate: runtime.p2PromptTemplate,
            p3PromptTemplate: runtime.p3PromptTemplate,
            p4PromptTemplate: runtime.p4PromptTemplate,
            p5PromptTemplate: runtime.p5PromptTemplate,
            pubmed: runtime.pubmed,
            europePmc: runtime.europePmc,
            onStageEvent: (event) => {
              if (event.type === 'stage_started') {
                send({ type: 'stage_started', runId: run.id, stage: event.stage });
              } else if (event.type === 'stage_result') {
                const detail = event.resumed ? `${event.status} (resumed)` : `${event.status} (${event.metrics.ms}ms)`;
                send({ type: 'stage_progress', runId: run.id, stage: event.stage, detail });
              } else {
                const claimsNote = event.outcome.status === 'ok' ? `, ${event.outcome.claims.length} claim(s)` : '';
                send({ type: 'stage_progress', runId: run.id, stage: 'extract', detail: `${event.sourceId}: ${event.outcome.status}${claimsNote}` });
              }
            },
          },
        );

        send({ type: 'band_ready', runId: run.id, payload: { claims: result.extraction.value ?? [] } });
        send({ type: 'receipt_ready', runId: run.id, receipt: buildReceipt(result) });

        const finalStatus = computeFinalStatus(result);
        await runtime.runsRepository.updateRunStatus(run.id, finalStatus);
        send({ type: 'done', runId: run.id, status: finalStatus });
      } catch (err) {
        send({ type: 'error', runId: run.id, message: err instanceof Error ? err.message : 'Unknown error' });
        await runtime.runsRepository.updateRunStatus(run.id, 'failed').catch(() => undefined);
        send({ type: 'done', runId: run.id, status: 'failed' });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive' },
  });
}
