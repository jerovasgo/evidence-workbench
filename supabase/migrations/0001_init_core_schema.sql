-- Day 1 core schema (SPEC §8 data model, module 10 security/privacy classification).
-- Every table has RLS enabled with no exceptions (CLAUDE.md rule 10, SPEC §10):
-- "Public" tables (sources, passages, claims, relations) get an explicit public-read
-- policy; "Private" tables (documents, watch_definitions) are owner-scoped; "Secret"
-- operational tables (budget_ledger) get RLS enabled with NO policies at all, so only
-- the service-role key (which bypasses RLS by Postgres/Supabase design) can touch them
-- from server code — anon/authenticated clients are denied by default.

-- ========================= Public: sources, passages =========================

create table if not exists public.sources (
  id text primary key,
  kind text not null check (kind in ('guideline','systematic_review','rct','observational','local_protocol','pathway_db','other')),
  title text not null,
  issuer text,
  year integer,
  version text,
  pmid text,
  doi text,
  url text not null,
  accessed_at timestamptz not null,
  content_hash text not null,
  superseded_by text references public.sources(id),
  retracted boolean not null default false,
  applies_to jsonb,
  native_grading_system text,
  created_at timestamptz not null default now()
);

alter table public.sources enable row level security;

create policy "sources are public read" on public.sources
  for select
  using (true);

comment on table public.sources is 'Public: source metadata only (CC-licensed quotes are short, SPEC §8/§10 classification).';

create table if not exists public.passages (
  id text primary key,
  source_id text not null references public.sources(id) on delete cascade,
  locator text not null,
  text text not null,
  cached_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '7 days'
);

alter table public.passages enable row level security;

create policy "passages are public read" on public.passages
  for select
  using (true);

comment on table public.passages is 'Public: cached source text with a TTL (module 10 retention); not committed to the repo.';

-- ========================= Public: claims, relations =========================

create table if not exists public.claims (
  id text primary key,
  text text not null,
  basis text not null check (basis in ('recommendation','background')),
  action_type text not null check (action_type in ('assess','test','treat','threshold','disposition','avoid','mechanism')),
  conditions jsonb not null default '[]'::jsonb,
  source_id text not null references public.sources(id),
  passage_id text not null references public.passages(id),
  quote text not null,
  grade jsonb not null,
  verification jsonb not null,
  safety_critical boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.claims enable row level security;

create policy "claims are public read" on public.claims
  for select
  using (true);

comment on table public.claims is 'Public: SPEC §8 Claim. Display-time invariant (quoteFound=true) is enforced in application code (VerifiedClaimSchema), not by a DB check, since partial/dropped claims are stored too for the Receipt.';

create table if not exists public.relations (
  id uuid primary key default gen_random_uuid(),
  from_claim_id text not null references public.claims(id),
  to_claim_id text not null references public.claims(id),
  kind text not null check (kind in ('agrees','differs','supersedes','contradicts','adapts')),
  evidence text not null,
  divergence jsonb,
  created_at timestamptz not null default now()
);

alter table public.relations enable row level security;

create policy "relations are public read" on public.relations
  for select
  using (true);

comment on table public.relations is 'Public: SPEC §8 Relation, including governance divergence payloads (module 05).';

-- ========================= Runs and stage outputs =========================
-- A run with user_id = null and is_precomputed = true is one of the anonymous-visitor
-- precomputed results (module 10: "anonymous visitors get precomputed results").
-- Any other run is only visible to the user who created it.

create table if not exists public.runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  is_precomputed boolean not null default false,
  intent text not null,
  status text not null default 'queued' check (status in ('queued','routing','running','partial','done','abstained','failed')),
  receipt jsonb,
  cost_usd numeric(10,4) not null default 0,
  prompt_versions jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint runs_user_or_precomputed check (user_id is not null or is_precomputed)
);

alter table public.runs enable row level security;

create policy "runs are visible to their owner or if precomputed" on public.runs
  for select
  using (is_precomputed or user_id = auth.uid());

comment on table public.runs is 'SPEC §8 Run. Scenario text is never stored here (module 10 ephemeral-by-default) — only structured fields, ids and metrics.';

create table if not exists public.stage_outputs (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.runs(id) on delete cascade,
  stage text not null,
  status text not null check (status in ('ok','partial','abstain','failed')),
  payload_ref jsonb,
  metrics jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.stage_outputs enable row level security;

create policy "stage_outputs follow their run's visibility" on public.stage_outputs
  for select
  using (
    exists (
      select 1 from public.runs r
      where r.id = stage_outputs.run_id
        and (r.is_precomputed or r.user_id = auth.uid())
    )
  );

comment on table public.stage_outputs is 'Per-stage resumption state (module 01); visibility mirrors the parent run, never queried directly by id.';

-- ========================= Private: documents, watch_definitions =========================
-- Field-encrypted at the application layer (AES-256-GCM, module 10); the DB only ever
-- stores the ciphertext envelope, never plaintext scenario/document content.

create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  encrypted_blob jsonb not null, -- { v, nonce, ciphertext, tag } — EncryptedBlob (module 10)
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

alter table public.documents enable row level security;

create policy "documents are owner-only" on public.documents
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

comment on table public.documents is 'Private: uploaded protocols, field-encrypted. Owner-only RLS, hard-deleted on request (module 10).';

create table if not exists public.watch_definitions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  encrypted_blob jsonb not null, -- encrypted JobSpec (module 09, scaffolded here for RLS parity)
  status text not null default 'active' check (status in ('active','paused')),
  created_at timestamptz not null default now()
);

alter table public.watch_definitions enable row level security;

create policy "watch_definitions are owner-only" on public.watch_definitions
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

comment on table public.watch_definitions is 'Private: encrypted JobSpec (module 09 builds the scheduling logic later; this table only exists for RLS now).';

-- ========================= Secret: budget_ledger =========================
-- RLS enabled with NO policies at all: anon and authenticated are denied by default;
-- only the service-role key (server-side only, module 10) can read/write this table,
-- because the service role bypasses RLS entirely by Postgres/Supabase design.

create table if not exists public.budget_ledger (
  id uuid primary key default gen_random_uuid(),
  run_id uuid references public.runs(id) on delete set null,
  kind text not null check (kind in ('run','daily')),
  cost_usd numeric(10,4) not null,
  created_at timestamptz not null default now()
);

alter table public.budget_ledger enable row level security;

comment on table public.budget_ledger is 'Secret/operational: no RLS policies on purpose. Service-role only (module 10 cost guard).';

-- ========================= audit_log =========================
-- Append-only; service role writes, each user can read their own entries.

create table if not exists public.audit_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  action text not null,
  entity_id text,
  at timestamptz not null default now()
);

alter table public.audit_log enable row level security;

create policy "audit_log is readable by its own user" on public.audit_log
  for select
  using (user_id = auth.uid());

comment on table public.audit_log is 'Append-only (module 10): who decided what and when, no content. Insert is service-role only (no insert policy for clients).';
