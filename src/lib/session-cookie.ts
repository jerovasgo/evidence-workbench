import { randomUUID } from 'node:crypto';
import { cookies } from 'next/headers';

// Anonymous per-browser identity for the dashboard's conversation history
// (SECURITY.md: no auth flow exists yet). httpOnly so it's never readable/forgeable
// from client-side JS; scopes every conversations-repository call. Next.js-specific
// (`next/headers`), so this lives under src/lib, not inside module 01 — modules stay
// framework-agnostic and testable without Next (CLAUDE.md module boundary rule).

const COOKIE_NAME = 'ewb_session';
const MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

export async function getOrCreateSessionId(): Promise<string> {
  const store = await cookies();
  const existing = store.get(COOKIE_NAME)?.value;
  if (existing) return existing;

  const id = randomUUID();
  store.set(COOKIE_NAME, id, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: MAX_AGE_SECONDS,
    path: '/',
  });
  return id;
}
