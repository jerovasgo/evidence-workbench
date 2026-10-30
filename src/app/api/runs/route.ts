import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createRun, CreateRunRequestSchema, getServerRuntime, intentNeedsRetrieval } from '@/modules/01-orchestrator';
import { getOrCreateSessionId } from '@/lib/session-cookie';

// Module 01: "Route handlers are thin: validate -> enqueue -> stream." All real
// logic lives in modules/01-orchestrator/pipeline/{create-run,run-retrieval}.ts,
// unit-tested there without Next.js at all. This handler calls `createRun` only —
// routing, cheap and fast (a live smoke test measured ~1-4s). For time-to-first-
// token: it does NOT run structure/plan/retrieve/extract/verify itself. For an
// intent that needs those (module 01's pipeline table), it stashes the free text in
// `pendingRunContext` (in-memory, single-use, keyed by the new run's id) and the
// client is expected to immediately open `GET /api/runs/:id/stream` (SSE), which
// runs the rest of the pipeline and streams progress as it happens — see that
// route's own comment for why a two-step POST-then-stream flow, not one call.
//
// `conversationId`/`mode` are the dashboard's (module 11) own fields, layered on
// top of `createRun`'s request shape rather than inside it — createRun's own
// contract stays routing-only. A successful 'routed' outcome persists a
// conversation turn (CLAUDE.md rule 3 scoped exception, docs/DECISIONS.md); a
// rejected/budget-exhausted/routing-failed attempt does not, since nothing usable
// happened server-side to continue a thread with.

const RequestWithConversationSchema = CreateRunRequestSchema.extend({
  conversationId: z.string().uuid().optional(),
  mode: z.enum(['auto', 'algorithm', 'evidence_map']).optional(),
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
        runtime.pendingRunContext.put(outcome.run.id, {
          freeText: parsed.data.freeText,
          depth: parsed.data.depth ?? 'balanced',
          routerCondition: outcome.routerOutput.condition,
          routerSetting: outcome.routerOutput.setting,
          opening: outcome.routerOutput.opening,
        });
      }

      const sessionId = await getOrCreateSessionId();
      const mode = parsed.data.mode ?? 'auto';
      let conversationId: string | undefined = parsed.data.conversationId;

      if (conversationId) {
        const appended = await runtime.conversationsRepository.addTurn({
          conversationId,
          sessionId,
          mode,
          freeText: parsed.data.freeText,
          runId: outcome.run.id,
        });
        if (!appended) conversationId = undefined; // not owned by this session -> start a new thread instead
      }
      if (!conversationId) {
        const created = await runtime.conversationsRepository.create({
          sessionId,
          title: parsed.data.freeText.slice(0, 80),
          mode,
          freeText: parsed.data.freeText,
          runId: outcome.run.id,
        });
        conversationId = created.conversationId;
      }

      return NextResponse.json(
        {
          runId: outcome.run.id,
          conversationId,
          intent: outcome.routerOutput.intent,
          status: outcome.run.status,
          streamUrl: needsStream ? `/api/runs/${outcome.run.id}/stream` : undefined,
        },
        { status: 201 },
      );
    }
  }
}
