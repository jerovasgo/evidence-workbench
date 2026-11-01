import { simpleResponse } from '@/lib/simple-response';
import { comparisonClarification } from '@/lib/research-intent';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createRun, CreateRunRequestSchema, getServerRuntime, intentNeedsRetrieval } from '@/modules/01-orchestrator';

// Module 01: "Route handlers are thin: validate -> enqueue -> stream." All real
// logic lives in modules/01-orchestrator/pipeline/{create-run,run-retrieval}.ts,
// unit-tested there without Next.js at all. This handler calls `createRun` only —
// routing, cheap and fast (a live smoke test measured ~1-4s). For time-to-first-
// token: it does NOT run structure/plan/retrieve/extract/verify itself. For an
// intent that needs those (module 01's pipeline table), it stashes the free text in
// `pendingRunContext` (Supabase-backed, single-use, keyed by the new run's id — see
// that store's own comment for why it isn't just an in-memory Map) and the client is
// expected to immediately open `GET /api/runs/:id/stream` (SSE), which runs the rest
// of the pipeline and streams progress as it happens — see that route's own comment
// for why a two-step POST-then-stream flow, not one call.
//
// `mode` is the dashboard's (module 11) own field, layered on top of `createRun`'s
// request shape rather than inside it — createRun's own contract stays
// routing-only. No conversation turn is persisted here (2026-10-31, docs/DECISIONS.md):
// no real login exists yet, so there is no one to own a saved thread for — every
// request today is anonymous, and CLAUDE.md rule 3's default (scenario text is not
// persisted) applies. `conversationsRepository` stays wired in `ServerRuntime` for
// when real auth exists, just unused by this handler until then.

const RequestWithConversationSchema = CreateRunRequestSchema.extend({
  mode: z.enum(['auto', 'algorithm', 'mechanism', 'evidence_map']).optional(),
  depth: z.enum(['quick', 'balanced', 'deep']).optional(),
});

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Request body must be valid JSON' }, { status: 400 });
  }

  const parsed = RequestWithConversationSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 });
  }

  const answer = simpleResponse(parsed.data.freeText);
  if (answer) return NextResponse.json({ status: 'direct_answer', answer });

  const clarification = comparisonClarification(parsed.data.freeText);
  if (clarification) return NextResponse.json({ status: 'clarification_required', clarification });

  const runtime = getServerRuntime();
  const outcome = await createRun(parsed.data, runtime);

  switch (outcome.status) {
    case 'rejected_identifiers':
      return NextResponse.json(
        {
          error:
            'This request appears to reference a specific identifiable person or personal contact details; rephrase without identifying information.',
          findingKinds: outcome.findings.map((f) => f.kind),
        },
        { status: 422 },
      );
    case 'budget_exhausted':
      return NextResponse.json(
        { error: "Today's shared demo budget has been reached; please try again tomorrow." },
        { status: 429 },
      );
    case 'routing_failed':
      return NextResponse.json(
        { error: 'Could not classify the request', runId: outcome.run.id, reason: outcome.reason },
        { status: 502 },
      );
    case 'routed': {
      const needsStream = outcome.run.status !== 'abstained' && intentNeedsRetrieval(outcome.routerOutput.intent);
      if (needsStream) {
        try {
          await runtime.pendingRunContext.put(outcome.run.id, {
            freeText: parsed.data.freeText,
            depth: parsed.data.depth ?? 'balanced',
            routerCondition: outcome.routerOutput.condition,
            routerSetting: outcome.routerOutput.setting,
            opening: outcome.routerOutput.opening,
          });
        } catch (err) {
          // Don't fail routing over this — worst case the stream route's own
          // existing "retrieval context not available" message fires, same honest
          // failure mode as an expired/already-consumed handoff, not a new one.
          console.log(JSON.stringify({ type: 'pending_run_context_put_failed', runId: outcome.run.id, message: err instanceof Error ? err.message : 'Unknown error' }));
        }
      }

      return NextResponse.json(
        {
          runId: outcome.run.id,
          intent: outcome.routerOutput.intent,
          status: outcome.run.status,
          streamUrl: needsStream ? `/api/runs/${outcome.run.id}/stream` : undefined,
        },
        { status: 201 },
      );
    }
  }
}
