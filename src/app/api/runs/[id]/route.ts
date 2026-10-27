import { NextResponse } from 'next/server';
import { getRunForViewer } from '@/lib/pipeline/create-run';
import { getServerRuntime } from '@/lib/server/runtime';

// Day-1 limitation: there is no sign-in flow yet (module 11 builds it), so every
// viewer is treated as anonymous (viewerUserId = null) — only precomputed runs are
// readable through this route until auth exists. getRunForViewer mirrors the `runs`
// RLS policy in code because this handler uses the service-role client, which
// bypasses RLS entirely; this check is what actually enforces visibility here.

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await context.params;
  const runtime = getServerRuntime();

  const outcome = await getRunForViewer(id, null, runtime);

  switch (outcome.status) {
    case 'not_found':
      return NextResponse.json({ error: 'Run not found' }, { status: 404 });
    case 'forbidden':
      return NextResponse.json({ error: 'Not authorized to view this run' }, { status: 403 });
    case 'found':
      return NextResponse.json({ run: outcome.run }, { status: 200 });
  }
}
