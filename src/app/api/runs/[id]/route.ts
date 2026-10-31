import { buildReviewAudit } from '@/lib/review-audit';
import { NextResponse } from 'next/server';
import { getRunForViewer, getServerRuntime } from '@/modules/01-orchestrator';

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
      if (new URL(_request.url).searchParams.get('audit') === '1') {
        try {
          const stages = await runtime.stageOutputsRepository.getLatestPerStage(id);
          return NextResponse.json({ audit: buildReviewAudit(stages) }, { headers: { 'Cache-Control': 'no-store' } });
        } catch {
          return NextResponse.json({ error: 'Review audit unavailable' }, { status: 503 });
        }
      }
      return NextResponse.json({ run: outcome.run }, { status: 200 });
  }
}
