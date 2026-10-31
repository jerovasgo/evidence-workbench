-- Module 01 reliability fix (2026-10-31, docs/DECISIONS.md): `GET /api/runs/:id/stream`'s
-- in-memory handoff from `POST /api/runs` (`pendingRunContext`) doesn't survive Vercel's
-- serverless functions, which give no guarantee the POST and the immediately-following
-- GET land on the same process — this caused "Retrieval context is no longer available"
-- in production for every anonymous user once conversation-history persistence (the
-- previous fallback source) was turned off for anonymous use (0004_conversations.sql).
--
-- This table replaces that in-memory `Map` with a durable, single-use, encrypted store
-- dedicated ONLY to this handoff. It is NOT conversation history: no title, no list, never
-- read by any UI, and deleted the moment it's consumed (`take()`), or opportunistically
-- swept after an hour if a run is abandoned before streaming. This supersedes
-- 0004_conversations.sql's "the one place scenario text is persisted" comment — there are
-- now two, for two different reasons: durable opt-in history (conversation_turns, inactive
-- until real login exists) and this ephemeral, always-on plumbing.

create table if not exists public.pending_run_context (
  run_id uuid primary key references public.runs (id) on delete cascade,
  encrypted_context jsonb not null, -- EncryptedBlob (module 10) of the whole PendingRunContext JSON: { v, nonce, ciphertext, tag }
  created_at timestamptz not null default now()
);

alter table public.pending_run_context enable row level security;

comment on table public.pending_run_context is
  'Ephemeral, single-use POST->GET handoff for the SSE stream route, field-encrypted (AES-256-GCM). Not conversation history: never listed, deleted on read or after 1h if abandoned. RLS enabled, no policies -- service-role only.';

-- service_role has BYPASSRLS but still needs an explicit table-level grant in this
-- project's default ACL (0003_service_role_grants.sql's own finding).
grant select, insert, update, delete on public.pending_run_context to service_role;
