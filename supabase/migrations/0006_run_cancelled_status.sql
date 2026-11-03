-- 2026-11-02 (docs/DECISIONS.md): real cancellation needs a terminal status distinct
-- from 'failed' — a stopped run is not an error. Adds 'cancelled' to the existing
-- CHECK constraint on runs.status (auto-named `runs_status_check`, confirmed via
-- 0001_init_core_schema.sql: no prior migration has touched this table).

alter table public.runs drop constraint if exists runs_status_check;
alter table public.runs add constraint runs_status_check
  check (status in ('queued','routing','running','partial','done','abstained','failed','cancelled'));
