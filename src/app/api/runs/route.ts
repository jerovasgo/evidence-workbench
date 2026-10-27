import { NextResponse } from 'next/server';
import { createRunAndRetrieve, CreateRunRequestSchema, getServerRuntime } from '@/modules/01-orchestrator';

// Module 01: "Route handlers are thin: validate -> enqueue -> stream." All real logic
// lives in modules/01-orchestrator/pipeline/{create-run,run-retrieval}.ts, unit-tested
// there without Next.js at all; this file only parses the request, wires the
// process-wide runtime in, and maps the pipeline's outcome to an HTTP response.
// `createRunAndRetrieve` runs structure/plan/retrieve/classify synchronously for
// intents that need it (module 02) before this handler responds — see that
// function's own comment for the Vercel-timeout caveat this carries today.

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
  const outcome = await createRunAndRetrieve(parsed.data, runtime);

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
    case 'routed':
      return NextResponse.json(
        {
          runId: outcome.run.id,
          intent: outcome.routerOutput.intent,
          status: outcome.run.status,
          // Stage statuses/metrics only — never scenario text (CLAUDE.md rule 3).
          retrieval: outcome.retrieval
            ? {
                structure: { status: outcome.retrieval.structure.status },
                plan: { status: outcome.retrieval.plan.status },
                retrieve: { status: outcome.retrieval.retrieval.status, counts: outcome.retrieval.retrieval.metrics.counts },
                classify: { status: outcome.retrieval.classification.status },
              }
            : undefined,
        },
        { status: 201 },
      );
  }
}
