import { NextResponse } from 'next/server';
import { createRun, CreateRunRequestSchema, getServerRuntime, intentNeedsRetrieval } from '@/modules/01-orchestrator';

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

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Request body must be valid JSON' }, { status: 400 });
  }

  const parsed = CreateRunRequestSchema.safeParse(body);
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
            'This request appears to reference a specific patient or personal contact details; rephrase without identifying information.',
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
          routerCondition: outcome.routerOutput.condition,
          routerSetting: outcome.routerOutput.setting,
        });
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
