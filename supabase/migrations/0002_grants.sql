-- Table-level GRANTs. RLS policies only filter which ROWS a role can see once it is
-- already allowed to attempt the statement — Postgres still requires an explicit
-- table-level GRANT for anon/authenticated before RLS ever gets evaluated. Without
-- this migration every policy in 0001 is unreachable and every query from the API
-- fails with "permission denied" instead of being row-filtered.

-- Public read tables: anon and authenticated may select; only service_role may write
-- (no insert/update/delete grants here — module 10: "service role key only in server code").
grant select on public.sources, public.passages, public.claims, public.relations to anon, authenticated;

-- runs / stage_outputs: select only; RLS narrows to precomputed-or-own. Writes happen
-- server-side with the service role, never directly from a client grant.
grant select on public.runs, public.stage_outputs to anon, authenticated;

-- Private, owner-scoped tables: authenticated users may fully manage their own rows
-- (RLS still restricts to user_id = auth.uid()); anonymous visitors get nothing, since
-- there is no private data an anonymous session should ever read or write.
grant select, insert, update, delete on public.documents, public.watch_definitions to authenticated;

-- audit_log: a user may read their own entries; inserts are service-role only (no
-- insert grant to anon/authenticated at all).
grant select on public.audit_log to authenticated;

-- budget_ledger: intentionally no grants to anon or authenticated — service_role only,
-- consistent with its RLS-enabled-no-policy setup in 0001 (secret/operational table).
