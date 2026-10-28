-- Module 11 dashboard: conversation history. CLAUDE.md rule 3 scoped exception
-- (2026-10-28, explicit user decision, see docs/DECISIONS.md) -- this is the one
-- place scenario text is persisted, and it is field-encrypted (AES-256-GCM,
-- module 10) at rest, same mechanism as documents/watch_definitions.
--
-- No real auth/sign-in flow exists yet (SECURITY.md known gap), so there is no
-- auth.uid() to scope rows to. Instead, an httpOnly session cookie identifies the
-- browser (src/lib/session-cookie.ts); only the service-role server ever reads or
-- writes these tables, scoping every query by that session id in application code --
-- the same "RLS enabled, no policies, service-role only" pattern already used for
-- budget_ledger (0001_init_core_schema.sql).

create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null,
  title text not null,
  mode text not null default 'auto',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.conversations enable row level security;

comment on table public.conversations is
  'Anonymous-session conversation threads (module 11 dashboard). RLS enabled, no policies -- service-role only, scoped in application code by an httpOnly session cookie, not auth.uid() (no auth flow exists yet).';

create index if not exists conversations_session_id_idx on public.conversations (session_id);

create table if not exists public.conversation_turns (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  run_id uuid references public.runs (id) on delete set null,
  mode text not null,
  encrypted_free_text jsonb not null, -- EncryptedBlob (module 10): { v, nonce, ciphertext, tag }
  created_at timestamptz not null default now()
);

alter table public.conversation_turns enable row level security;

comment on table public.conversation_turns is
  'Scenario text persisted here ONLY, field-encrypted (AES-256-GCM) -- CLAUDE.md rule 3 scoped exception, 2026-10-28. RLS enabled, no policies -- service-role only.';

create index if not exists conversation_turns_conversation_id_idx on public.conversation_turns (conversation_id);

-- service_role has BYPASSRLS but still needs an explicit table-level grant in this
-- project's default ACL (0003_service_role_grants.sql's own finding, applies to any
-- new table the same way).
grant select, insert, update, delete on public.conversations, public.conversation_turns to service_role;
