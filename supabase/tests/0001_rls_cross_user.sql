-- RLS policy test suite (module 10 build note: "a policy test suite (two users,
-- attempts cross-access) runs in CI"). Run manually today via the Supabase MCP
-- execute_sql tool or `psql`; wiring it into GitHub Actions CI is tracked as a
-- follow-up (no CI workflow exists yet in this repo).
--
-- Uses two FABRICATED user ids and Postgres session variables to simulate each
-- user's JWT (auth.uid() reads request.jwt.claim.sub — see auth.uid()'s own
-- definition). This creates NO real accounts and sends no credentials anywhere; it
-- is a pure SQL-level simulation. Everything runs inside one transaction that is
-- rolled back at the end, so the live project is left exactly as it was.
--
-- Any ASSERT failure aborts the transaction with an error — a clean pass prints
-- nothing but NOTICEs.

begin;

do $$
declare
  user_a uuid := '11111111-1111-1111-1111-111111111111';
  user_b uuid := '22222222-2222-2222-2222-222222222222';
begin
  -- auth.users rows to satisfy the user_id foreign keys below — a raw table insert
  -- inside this same rolled-back transaction, not a signup: no email, password,
  -- session or auth flow is involved, and nothing persists past the ROLLBACK.
  insert into auth.users (id) values (user_a), (user_b);

  -- Fixtures, inserted as the privileged role that runs this script (bypasses RLS).
  insert into public.documents (user_id, encrypted_blob) values
    (user_a, '{"v":1,"nonce":"a","ciphertext":"docA","tag":"a"}'::jsonb),
    (user_b, '{"v":1,"nonce":"b","ciphertext":"docB","tag":"b"}'::jsonb);

  insert into public.watch_definitions (user_id, encrypted_blob) values
    (user_a, '{"v":1,"nonce":"a","ciphertext":"watchA","tag":"a"}'::jsonb),
    (user_b, '{"v":1,"nonce":"b","ciphertext":"watchB","tag":"b"}'::jsonb);

  insert into public.runs (user_id, is_precomputed, intent) values
    (null, true, 'algorithm'),           -- visible to everyone, including anon
    (user_a, false, 'algorithm'),        -- user A's private live run
    (user_b, false, 'evidence_map');     -- user B's private live run

  insert into public.budget_ledger (kind, cost_usd) values ('daily', 1.23);
end $$;

-- ---------- User A's session ----------
set local role authenticated;
set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';

do $$
declare
  seen_docs int;
  seen_other_docs int;
  seen_watches int;
  seen_runs int;
  updated_rows int;
begin
  select count(*) into seen_docs from public.documents;
  assert seen_docs = 1, format('user A should see exactly 1 document, saw %s', seen_docs);

  select count(*) into seen_other_docs from public.documents
    where user_id = '22222222-2222-2222-2222-222222222222';
  assert seen_other_docs = 0, 'user A must not see user B''s document row, even by filtering for it directly';

  select count(*) into seen_watches from public.watch_definitions;
  assert seen_watches = 1, format('user A should see exactly 1 watch_definition, saw %s', seen_watches);

  select count(*) into seen_runs from public.runs;
  assert seen_runs = 2, format('user A should see the precomputed run plus their own (2), saw %s', seen_runs);

  -- Attempt to update user B's document as user A — RLS must make this affect 0 rows.
  update public.documents set encrypted_blob = '{"v":1,"nonce":"x","ciphertext":"tampered","tag":"x"}'::jsonb
    where user_id = '22222222-2222-2222-2222-222222222222';
  get diagnostics updated_rows = row_count;
  assert updated_rows = 0, format('user A must not be able to update user B''s document, affected %s rows', updated_rows);
end $$;

-- ---------- User B's session ----------
set local request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';

do $$
declare
  seen_docs int;
  seen_runs int;
begin
  select count(*) into seen_docs from public.documents;
  assert seen_docs = 1, format('user B should see exactly 1 document (their own), saw %s', seen_docs);

  select count(*) into seen_runs from public.runs;
  assert seen_runs = 2, format('user B should see the precomputed run plus their own (2), saw %s', seen_runs);
end $$;

-- ---------- Anonymous session (no JWT claim at all) ----------
reset request.jwt.claim.sub;
set local role anon;

-- runs: anon HAS a table-level grant (precomputed results must be publicly readable),
-- so this is a pure RLS check — the precomputed row only.
do $$
declare
  seen_runs int;
begin
  select count(*) into seen_runs from public.runs;
  assert seen_runs = 1, format('anon must see exactly the 1 precomputed run, saw %s', seen_runs);
end $$;

-- documents / watch_definitions / budget_ledger: anon has NO table-level grant at all
-- (0002_grants.sql), which is a stronger denial than RLS row-filtering — Postgres
-- raises insufficient_privilege before RLS is even evaluated. Both outcomes count as
-- "anon cannot read this row", so either an error or a verified-empty result passes.
do $$
declare
  seen_docs int;
begin
  begin
    select count(*) into seen_docs from public.documents;
    assert seen_docs = 0, format('anon must see 0 private documents, saw %s', seen_docs);
  exception when insufficient_privilege then
    raise notice 'anon correctly denied table-level access to documents';
  end;
end $$;

do $$
declare
  seen_watches int;
begin
  begin
    select count(*) into seen_watches from public.watch_definitions;
    assert seen_watches = 0, format('anon must see 0 watch_definitions, saw %s', seen_watches);
  exception when insufficient_privilege then
    raise notice 'anon correctly denied table-level access to watch_definitions';
  end;
end $$;

do $$
declare
  seen_budget int;
begin
  begin
    select count(*) into seen_budget from public.budget_ledger;
    assert seen_budget = 0, format('anon must see 0 budget_ledger rows, saw %s', seen_budget);
  exception when insufficient_privilege then
    raise notice 'anon correctly denied table-level access to budget_ledger (secret table)';
  end;
end $$;

do $$
begin
  raise notice 'RLS cross-user test suite: all assertions passed.';
end $$;

rollback; -- leave the live project exactly as it was before this script ran
