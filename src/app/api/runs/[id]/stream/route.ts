import {
  buildReceipt,
  getRunForViewer,
  getServerRuntime,
  runRetrievalPipeline,
  type RunRetrievalResult,
  type ServerRuntime,
} from '@/modules/01-orchestrator';
import { labelRelationsBatched, pairClaimsForRelations } from '@/modules/05-governance';
import type { AgentTraceEvent } from '@/shared/agents';
import { ClaimSchema, ReceiptSchema, RelationSchema, type Claim, type RunEvent } from '@/shared/domain';
import { CandidateSourceSchema } from '@/modules/02-retrieval';
import { RESEARCH_DEPTH_CONCURRENCY, RESEARCH_DEPTH_TIME_MS } from '@/lib/research-depth';
import { lookupGeneContext } from '@/modules/02-retrieval';

// 2026-10-28 latency audit (docs/DECISIONS.md): `runAgent` (shared/agents) already
// emits an `onTrace` event — {name, ms, costUsd, tokens} — for every single model
// call in the pipeline, but nothing ever consumed it; every run's real per-agent
// timing was silently discarded. These two loggers are the "quick win" fix: one
// structured JSON line per agent call and one per finished run, both ids/timings/
// costs only (CLAUDE.md rule 3 — never prompt or scenario text), so real p50/p95
// latency can finally be computed from server logs instead of guessed.
function logAgentTrace(runId: string, event: AgentTraceEvent): void {
  if (event.type === 'agent_result') {
    console.log(JSON.stringify({ type: 'agent_latency', runId, name: event.name, ok: event.ok, ms: event.ms, costUsd: event.costUsd, tokens: event.tokens }));
  } else if (event.type === 'agent_abstain') {
    console.log(JSON.stringify({ type: 'agent_abstain', runId, name: event.name, reason: event.reason }));
  }
}

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
// first-action yet (that needs the algorithm graph, module 06, not built), so
// ordering is only by evidence kind (`extract-and-verify-pool.ts`'s guideline >
// systematic_review > RCT ordering) — an honest, documented simplification of the
// real design, not the real thing.
//
// 2026-10-28 latency audit: `band_ready` now sends MULTIPLE times, not once.
// `extract-and-verify-pool.ts` already runs sources with bounded concurrency and
// fires `onSourceDone` as EACH ONE finishes — previously that per-source signal only
// produced a `stage_progress` text line, and every verified claim sat on the server
// until the ENTIRE pipeline resolved (all sources, all support-judge calls) before
// one single `band_ready` burst. The first source to finish is typically ready in
// ~10-15s; the whole pool can take 60-90s+. Every source's claims now stream to the
// client the moment that source finishes (a `band_ready` per contributing source,
// cumulative), instead of making the client wait for the slowest one. `sourceScores`
// isn't known until classification resolves (before extraction) but isn't exposed
// via a callback — it rides only on the final `band_ready` (after the full pipeline
// resolves), a deliberate, low-risk scope cut: claims are the TTFT-critical data:
// the "why ranked here" score breakdown is secondary metadata read only after
// opening a claim's evidence drawer, never needed before then.

function sseFrame(event: RunEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

// Module 05 `relation-labeller` slice (2026-10-28 scoping decision, docs/DECISIONS.md):
// runs cross-source relation labelling strictly AFTER the client's terminal `done`
// event has already been enqueued, so it can never add to this run's TTFT — it is
// awaited (not fire-and-forget) only so the Vercel function instance stays alive
// long enough to finish safely before the handler returns and the instance can be
// torn down. Never sends an SSE frame of its own; failures are logged, not surfaced
// to a client that has already moved on.
async function labelRelationsAfterDone(runId: string, claims: Claim[], runtime: ServerRuntime): Promise<{ relations: import('@/shared/domain').Relation[]; status: 'ok' | 'partial' }> {
  const pairs = pairClaimsForRelations(claims);
  if (pairs.length === 0) return { relations: [], status: 'ok' };

  const started = Date.now();
  const result = await labelRelationsBatched(runId, pairs, {
    metaClient: runtime.metaClient,
    budgetGuard: runtime.budgetGuard,
    p0Preamble: runtime.p0Preamble,
    p7PromptTemplate: runtime.p7PromptTemplate,
    onTrace: (event) => logAgentTrace(runId, event),
  });
  const ms = Date.now() - started;

  await runtime.stageOutputsRepository.insert({
    runId,
    stage: 'relate',
    status: result.relations.length > 0 || result.failures.length === 0 ? 'ok' : 'partial',
    value: result.relations,
    reasons: result.failures.map((f) => f.reason),
    metrics: { ms, costUsd: result.costUsd, counts: { pairs: pairs.length, relations: result.relations.length, failures: result.failures.length } },
  });
  console.log(JSON.stringify({ type: 'stage_latency', runId, stage: 'relate', status: 'ok', ms, resumed: false }));
  return { relations: result.relations, status: result.failures.length ? 'partial' : 'ok' };
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
  const streamStarted = Date.now();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const send = (event: RunEvent) => controller.enqueue(encoder.encode(sseFrame(event)));
      // Claims accumulated so far across already-finished sources, sent as a
      // cumulative `band_ready` each time a new one arrives — see the latency-audit
      // comment above. `sourceScores` only rides the final, authoritative send.
      const streamedClaims: Claim[] = [];
      const provisionalBySource = new Map<string, number>();

      // A reconnect after the run already finished: nothing to stream, just report
      // the terminal state once (module 01: "results retrievable by run id").
      if (run.status === 'done' || run.status === 'partial' || run.status === 'abstained' || run.status === 'failed') {
        const saved = await runtime.stageOutputsRepository.getLatestPerStage(run.id).catch(() => new Map());
        const candidates = CandidateSourceSchema.array().safeParse(saved.get('retrieve')?.value);
        if (candidates.success) send({ type: 'source_catalog_ready', runId: run.id, sources: candidates.data.map(({ tempId, title, url, doi, pmid, year }) => ({ id: tempId, status: 'candidate', title, url, doi, pmid, year })) });
        const claims = ClaimSchema.array().safeParse(saved.get('extract')?.value);
        if (claims.success) send({ type: 'band_ready', runId: run.id, payload: { claims: claims.data } });
        const qualified = ClaimSchema.array().safeParse(saved.get('qualified_claims')?.value);
        if (qualified.success) {
          for (const sourceId of [...new Set(qualified.data.map((claim) => claim.sourceId))]) {
            send({ type: 'qualified_claims_ready', runId: run.id, sourceId, claims: qualified.data.filter((claim) => claim.sourceId === sourceId) });
          }
        }
        const receipt = ReceiptSchema.safeParse(saved.get('receipt')?.value);
        if (receipt.success) send({ type: 'receipt_ready', runId: run.id, receipt: receipt.data });
        send({ type: 'done', runId: run.id, status: run.status });
        const relations = RelationSchema.array().safeParse(saved.get('relate')?.value);
        send({ type: 'relations_ready', runId: run.id, questions: [], relations: relations.success ? relations.data : [], status: relations.success ? 'ok' : 'partial' });
        controller.close();
        return;
      }

      const pending = runtime.pendingRunContext.take(run.id);
      if (pending) {
        send({ type: 'opening_ready', runId: run.id, text: pending.opening?.trim() || `I’m reviewing the genetic evidence relevant to your question. The initial source context will appear first; conclusions will update as the studies are checked.` });
      }
      // Reference lookups run beside the literature pipeline. They may enrich the
      // overview, but cannot delay retrieval or turn a gene record into a study.
      void (pending ? lookupGeneContext(pending.freeText).then((genes) => {
        if (genes.length && !closed) send({ type: 'gene_context_ready', runId: run.id, genes });
      }).catch(() => undefined) : Promise.resolve());

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
            p10PromptTemplate: runtime.p10PromptTemplate,
            pubmed: runtime.pubmed,
            europePmc: runtime.europePmc,
            extractionTimeBudgetMs: RESEARCH_DEPTH_TIME_MS[pending?.depth ?? 'balanced'],
            maxExtractConcurrency: RESEARCH_DEPTH_CONCURRENCY[pending?.depth ?? 'balanced'],
            onTrace: (event) => logAgentTrace(run.id, event),
            onStageEvent: (event) => {
              if (event.type === 'stage_started') {
                send({ type: 'stage_started', runId: run.id, stage: event.stage });
              } else if (event.type === 'stage_result') {
                const detail = event.resumed ? `${event.status} (resumed)` : `${event.status} (${event.metrics.ms}ms)`;
                send({ type: 'stage_progress', runId: run.id, stage: event.stage, detail });
                console.log(
                  JSON.stringify({ type: 'stage_latency', runId: run.id, stage: event.stage, status: event.status, ms: event.metrics.ms, resumed: event.resumed, elapsedMs: Date.now() - streamStarted }),
                );
              } else if (event.type === 'sources_retrieved') {
                send({ type: 'overview_ready', runId: run.id, sources: event.sources.slice(0, 5).map(({ title, year, url }) => ({ title, year, url })) });
                send({ type: 'source_catalog_ready', runId: run.id, sources: event.sources.map(({ tempId, title, url, doi, pmid, year }) => ({ id: tempId, status: 'candidate', title, url, doi, pmid, year })) });
                console.log(JSON.stringify({ type: 'overview_latency', runId: run.id, elapsedMs: Date.now() - streamStarted }));
              } else if (event.type === 'provisional_claims') {
                provisionalBySource.set(event.sourceId, event.claims.length);
                send({ type: 'provisional_claims_ready', runId: run.id, sourceId: event.sourceId, claims: event.claims });
                if (provisionalBySource.size === 1) console.log(JSON.stringify({ type: 'first_provisional_latency', runId: run.id, elapsedMs: Date.now() - streamStarted }));
              } else {
                if (event.outcome.status === 'ok' && event.outcome.qualified.length > 0) {
                  send({ type: 'qualified_claims_ready', runId: run.id, sourceId: event.sourceId, claims: event.outcome.qualified });
                }
                const claimsNote = event.outcome.status === 'ok' ? `, ${event.outcome.claims.length} claim(s)` : '';
                send({ type: 'stage_progress', runId: run.id, stage: 'extract', detail: `${event.sourceId}: ${event.outcome.status}${claimsNote}` });

                // Stream this source's claims the moment they're verified, instead of
                // waiting for every other source to finish too (see the comment above).
                if (event.outcome.status === 'ok' && event.outcome.claims.length > 0) {
                  streamedClaims.push(...event.outcome.claims);
                  if (streamedClaims.length === event.outcome.claims.length) {
                    console.log(JSON.stringify({ type: 'first_claims_latency', runId: run.id, elapsedMs: Date.now() - streamStarted }));
                  }
                  send({ type: 'band_ready', runId: run.id, payload: { claims: [...streamedClaims] } });
                }
                const provisionalCount = provisionalBySource.get(event.sourceId) ?? 0;
                if (provisionalCount > 0) {
                  const acceptedClaimIds = event.outcome.status === 'ok' ? [...event.outcome.claims, ...event.outcome.qualified].map((claim) => claim.id) : [];
                  const withdrawnCount = Math.max(0, provisionalCount - acceptedClaimIds.length);
                  const reason = withdrawnCount > 0
                    ? event.outcome.status === 'ok' ? [...new Set(event.outcome.withdrawn.map((entry) => entry.reason))].join('; ') : 'source verification was interrupted'
                    : undefined;
                  send({ type: 'source_reviewed', runId: run.id, sourceId: event.sourceId, acceptedClaimIds, withdrawnCount, reason });
                }
              }
            },
          },
        );

        send({ type: 'band_ready', runId: run.id, payload: { claims: result.extraction.value ?? [], sourceScores: result.sourceScores } });
        const receipt = buildReceipt(result);
        send({ type: 'receipt_ready', runId: run.id, receipt });

        const finalStatus = computeFinalStatus(result);
        await runtime.runsRepository.updateRunStatus(run.id, finalStatus);
        send({ type: 'done', runId: run.id, status: finalStatus });
        console.log(JSON.stringify({ type: 'run_latency', runId: run.id, status: finalStatus, totalMs: Date.now() - streamStarted, claimsTotal: result.extraction.value?.length ?? 0 }));

        try {
          await runtime.stageOutputsRepository.insert({ runId: run.id, stage: 'receipt', status: 'ok', value: receipt, metrics: { ms: 0, costUsd: 0 } });
        } catch {
          // The receipt was already sent to the live viewer.
        }

        // Strictly after `done` — see labelRelationsAfterDone's own comment. Never
        // lets a relation-labelling failure surface as a stream `error` event.
        try {
          const related = await labelRelationsAfterDone(run.id, result.extraction.value ?? [], runtime);
          send({ type: 'relations_ready', runId: run.id, questions: result.structure.value?.subQuestions ?? [], ...related });
        } catch (err) {
          console.log(JSON.stringify({ type: 'relate_error', runId: run.id, message: err instanceof Error ? err.message : 'Unknown error' }));
          send({ type: 'relations_ready', runId: run.id, questions: result.structure.value?.subQuestions ?? [], relations: [], status: 'failed' });
        }
      } catch (err) {
        send({ type: 'error', runId: run.id, message: err instanceof Error ? err.message : 'Unknown error' });
        await runtime.runsRepository.updateRunStatus(run.id, 'failed').catch(() => undefined);
        send({ type: 'done', runId: run.id, status: 'failed' });
      } finally {
        closed = true;
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive' },
  });
}
