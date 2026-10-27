import { NextResponse } from 'next/server';
import { createRun, CreateRunRequestSchema } from '@/lib/pipeline/create-run';
import { getServerRuntime } from '@/lib/server/runtime';

// Module 01: "Route handlers are thin: validate -> enqueue -> stream." All real logic
// lives in src/lib/pipeline/create-run.ts, unit-tested there without Next.js at all;
// this file only parses the request, wires the process-wide runtime in, and maps the
// pipeline's outcome to an HTTP response.

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
    case 'routed':
      return NextResponse.json(
        { runId: outcome.run.id, intent: outcome.routerOutput.intent, status: outcome.run.status },
        { status: 201 },
      );
  }
}
