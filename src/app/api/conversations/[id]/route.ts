import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getServerRuntime } from '@/modules/01-orchestrator';
import { getOrCreateSessionId } from '@/lib/session-cookie';

// Module 11 dashboard: one conversation's full thread (GET, for loading it into the
// workspace), rename (PATCH) and delete (DELETE). All three are scoped to the
// caller's session id (src/lib/session-cookie.ts) — there is no auth yet, so
// "ownership" means "created by this browser," enforced in
// conversations-repository.ts's own queries, not by RLS (see its comment).

const RenameSchema = z.object({ title: z.string().min(1).max(200) });

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await context.params;
  const runtime = getServerRuntime();
  const sessionId = await getOrCreateSessionId();

  const result = await runtime.conversationsRepository.getWithTurns(id, sessionId);
  if (!result) return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });

  return NextResponse.json(result);
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await context.params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Request body must be valid JSON' }, { status: 400 });
  }

  const parsed = RenameSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 });
  }

  const runtime = getServerRuntime();
  const sessionId = await getOrCreateSessionId();
  const renamed = await runtime.conversationsRepository.rename(id, sessionId, parsed.data.title);
  if (!renamed) return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });

  return NextResponse.json({ ok: true });
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await context.params;
  const runtime = getServerRuntime();
  const sessionId = await getOrCreateSessionId();

  const removed = await runtime.conversationsRepository.remove(id, sessionId);
  if (!removed) return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });

  return NextResponse.json({ ok: true });
}
