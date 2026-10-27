# Security — status and honest limits

This is a hackathon prototype (CLAUDE.md, SPEC §10), not a compliance certification.
This file tracks what is actually built, not the full target state in `docs/architecture/10-security-privacy-cost.md`.

## Built so far (2026-10-27, Day 1)

- **RLS on every table.** `supabase/migrations/0001_init_core_schema.sql` creates the
  Day-1 core schema (`sources`, `passages`, `claims`, `relations`, `runs`,
  `stage_outputs`, `documents`, `watch_definitions`, `budget_ledger`, `audit_log`) with
  Row-Level Security enabled on all ten tables, no exceptions.
  - Public tables (`sources`, `passages`, `claims`, `relations`): public read policy.
  - `runs`/`stage_outputs`: visible if precomputed or owned by `auth.uid()`.
  - Private tables (`documents`, `watch_definitions`): owner-only (`user_id = auth.uid()`).
  - `audit_log`: a user reads only their own entries; no client insert policy.
  - `budget_ledger`: RLS enabled with **no policies at all** — intentionally
    unreachable from anon/authenticated; service-role only. This is the one expected
    `rls_enabled_no_policy` INFO finding in `get_advisors` and should stay that way.
- **Table-level grants** (`supabase/migrations/0002_grants.sql`): RLS only filters rows
  a role is already allowed to query — Postgres still requires an explicit `GRANT`
  before that. Public tables and `runs`/`stage_outputs` are granted to `anon` and
  `authenticated`; `documents`/`watch_definitions`/`audit_log` are granted to
  `authenticated` only; `budget_ledger` has no grant to either, so a client query
  against it fails with `insufficient_privilege` before RLS is even evaluated.
- **Hardened a pre-existing function:** `public.rls_auto_enable()` (an event-trigger
  helper that auto-enables RLS on new tables, not created by this project) was
  reachable as a public RPC because it is `SECURITY DEFINER`. Revoked `EXECUTE` from
  `public`/`anon`/`authenticated` per the Supabase linter's own remediation
  (0028/0029) — its event-trigger behaviour is unchanged.
- **RLS cross-user test suite:** `supabase/tests/0001_rls_cross_user.sql` simulates two
  fabricated users (`auth.uid()` via `request.jwt.claim.sub`, no real signups) and
  verifies: each user sees only their own `documents`/`watch_definitions` row plus the
  one precomputed `run`; a user cannot update another user's `documents` row (0 rows
  affected); anonymous sessions see only the precomputed run and are denied
  table-level access to every private/secret table. Run manually on 2026-10-27 against
  the live `BenchBark` project — passed. **Not yet wired into CI** (no GitHub Actions
  workflow exists in this repo yet); module 10 calls for that, tracked as a follow-up.
- **Deterministic validators** (`src/lib/validators/`): quote verbatim-match (with a
  bounded OCR-noise fallback), numbers-preserved check, dose rule, and the module-06
  algorithm-graph invariants (acyclic except a `reassess` back-edge, single start, red
  flags first, terminal leaves, claim citations, no orphans, node cap). 91 vitest tests.
- **Budget guard** (`src/lib/security/budget-guard.ts`): in-memory per-run/daily cost
  caps, checked before every `runAgent` model call. Not yet backed by the Postgres
  `budget_ledger` table from a server route — that wiring is a follow-up.
- **Secrets:** `META_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, and `APP_ENCRYPTION_KEY`
  live only in `.env.local` (gitignored, confirmed with `git check-ignore`); never
  printed in chat or logs. `APP_ENCRYPTION_KEY` confirmed to decode to the required 32
  bytes.
- **Field-level encryption** (`src/lib/security/encryption.ts`): AES-256-GCM with a
  random 96-bit nonce per call, authenticated data = `userId|recordId` (module 10) so
  a ciphertext copied to another row or read under another user's id fails to decrypt
  rather than silently returning the wrong plaintext. Key is versioned
  (`EncryptedBlob.v`) through an `EncryptionKeyring` so a future key rotation adds a
  version without changing this module's shape. 11 vitest tests cover round-trip,
  ciphertext/tag tampering, cross-user and cross-record AAD mismatches, and a
  rotation-gap (no key for that version) failure. Not yet wired into any route handler
  that actually writes to `documents`/`watch_definitions`.

## Known gaps (not built yet)

- No server route handlers, so the service-role key, budget guard, RLS policies, and
  the encryption module above are not yet exercised end-to-end from an actual request.
- No CI workflow: lint/typecheck/test run locally only; the RLS test suite above is a
  manual SQL script, not a CI gate.
- No rate limiting, CSP, or identifier filter yet (module 10 items for later days).
- No Auth UI/flow built — the RLS policies are ready for `auth.uid()`-bearing sessions,
  but there is no sign-up/sign-in page yet.
