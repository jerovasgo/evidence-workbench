-- Discovered via a real smoke test against the live project (next dev + POST
-- /api/runs): service_role has BYPASSRLS, but that is NOT the same as a table-level
-- grant. This project's default ACL for tables created by `postgres` only gives
-- anon/authenticated/service_role TRUNCATE/REFERENCES/TRIGGER — no SELECT/INSERT/
-- UPDATE/DELETE — which is why 0002_grants.sql had to grant anon/authenticated
-- explicitly, and why service_role needs the same treatment here. Without this,
-- every server-side write (CLAUDE.md: "service role key only in server code") fails
-- with "permission denied for table ..." even though RLS itself is bypassed.

grant select, insert, update, delete on
  public.sources, public.passages, public.claims, public.relations,
  public.runs, public.stage_outputs,
  public.documents, public.watch_definitions,
  public.budget_ledger, public.audit_log
to service_role;
