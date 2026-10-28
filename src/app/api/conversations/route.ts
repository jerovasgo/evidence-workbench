import { NextResponse } from 'next/server';
import { getServerRuntime } from '@/modules/01-orchestrator';
import { getOrCreateSessionId } from '@/lib/session-cookie';

// Module 11 dashboard: conversation history list (sidebar). Scenario text (the
// turns' free text) is intentionally NOT included here — this is just titles/
// timestamps for the sidebar; GET /api/conversations/:id returns the decrypted
// turns for a conversation the user actually opens.

export async function GET(): Promise<Response> {
  const runtime = getServerRuntime();
  const sessionId = await getOrCreateSessionId();
  const conversations = await runtime.conversationsRepository.listForSession(sessionId);
  return NextResponse.json({ conversations });
}
