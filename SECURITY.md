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
- **`service_role` grants** (`supabase/migrations/0003_service_role_grants.sql`):
  `service_role` has `BYPASSRLS` but, in this project, was never given a table-level
  grant either — found by an actual `next dev` smoke test, where every server-side
  write failed with "permission denied for table runs" until this migration explicitly
  granted SELECT/INSERT/UPDATE/DELETE on all ten tables to `service_role`.
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
- **Deterministic validators** (`src/modules/03-extraction-verification/validators/`): quote verbatim-match (with a
  bounded OCR-noise fallback), numbers-preserved check, dose rule; plus, in
  `src/modules/06-algorithm/validators/`, the graph invariants (acyclic except a
  `reassess` back-edge, single start, red flags first, terminal leaves, claim
  citations, no orphans, node cap).
- **Budget guard** (`src/shared/security/budget-guard.ts`): in-memory per-run/daily cost
  caps, checked before every `runAgent` model call. Not yet backed by the Postgres
  `budget_ledger` table from a server route — that wiring is a follow-up.
- **Secrets:** `META_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, and `APP_ENCRYPTION_KEY`
  live only in `.env.local` (gitignored, confirmed with `git check-ignore`); never
  printed in chat or logs. `APP_ENCRYPTION_KEY` confirmed to decode to the required 32
  bytes.
- **Field-level encryption** (`src/shared/security/encryption.ts`): AES-256-GCM with a
  random 96-bit nonce per call, authenticated data = `userId|recordId` (module 10) so
  a ciphertext copied to another row or read under another user's id fails to decrypt
  rather than silently returning the wrong plaintext. Key is versioned
  (`EncryptedBlob.v`) through an `EncryptionKeyring` so a future key rotation adds a
  version without changing this module's shape. 11 vitest tests cover round-trip,
  ciphertext/tag tampering, cross-user and cross-record AAD mismatches, and a
  rotation-gap (no key for that version) failure. Not yet wired into any route handler
  that actually writes to `documents`/`watch_definitions`.
- **First route handlers** (`src/app/api/runs/route.ts` POST, `src/app/api/runs/[id]/route.ts`
  GET): the module 01 request lifecycle's first slice — validate (zod) → identifier
  pre-filter (CLAUDE.md rule 3) → daily-budget kill switch → `router` agent (P1) →
  persist via the service-role Supabase client. Handlers are thin; the real logic
  (`src/modules/01-orchestrator/`) is unit-tested against fakes. Also exercised
  against the **real** Meta API and the real Supabase project with `next dev` + `curl`
  on 2026-10-27 (all test rows/users cleaned up afterward) — see `docs/DECISIONS.md`
  for what that live run caught: a Turbopack module-resolution issue, the missing
  `service_role` grants above, the Meta API's undocumented `strict: true` requirement,
  and a too-small reasoning/token budget. `GET /api/runs/[id]` currently treats every
  viewer as anonymous (no auth flow exists yet), so only precomputed runs are
  reachable through it for now.
- **Retrieval agents** (`src/modules/02-retrieval/agents/`: `search-planner` P3,
  `source-classifier` P4): both live-tested against the real Meta API on 2026-10-27
  (a real ACS question produced a 7-query plan under the cap, with an adversarial and
  a currency query as required; a real guideline vs. a blog post were classified
  correctly, including the code-only `applyPubmedTypeOverride` rule that forces `kind`
  from decisive PubMed publication types). Not yet wired into any route handler or the
  orchestrator — module 01's `scenario-structurer` (P2) they'd normally take input
  from isn't built yet.
- **SSRF guard** (`src/shared/security/url-guard.ts`): `fetch_url_text` (module 02) only
  fetches `https` URLs on an explicit domain allow-list, rejects literal
  private/loopback hostnames, and re-checks every redirect hop against the same
  allow-list (module 10: "no private IP ranges, no redirects to disallowed hosts").
  Known gap, documented in the code: it does not re-resolve DNS at fetch time, so a
  DNS-rebinding attack against an allow-listed hostname is not closed by this check
  alone. Response bodies are read under a hard byte cap regardless of what
  `Content-Length` claims.
- **Scenario structurer** (`src/modules/01-orchestrator/agents/scenario-structurer.ts`, P2):
  live-tested against the real Meta API on 2026-10-27 for a real ACS scenario — produced
  population, setting, 5 sub-questions and `genericParameters.ageGroup` correctly on the
  first try. Its `subQuestions` output now feeds `search-planner` (P3) for real, replacing
  the simplified stand-in noted in `prompts/P3-search-planner.md`.
- **Retrieve step** (`src/modules/02-retrieval/retrieval/execute-plan.ts`): executes a
  `SearchPlan` against the live PubMed/Europe PMC connectors with bounded concurrency
  (default 4) and a per-query timeout (default 8s), mapping results into
  `CandidateSource[]`. Only `pubmed`/`europe_pmc` queries are executable; `guideline`/
  `web`/`local` queries are recorded as skipped (not faked), tracked below under Known
  gaps. A connector failure on one query is recorded and the plan continues (CLAUDE.md
  rule 12 / module 01: "one source times out -> continue without it") — live-tested
  2026-10-27 end to end, which caught a real HTTP 429 from PubMed `esummary` under
  concurrent load even within NCBI's documented 3/s-without-key limit; the pipeline
  correctly dropped only the affected queries and returned the rest. `server/runtime.ts`
  now passes `NCBI_API_KEY` (if configured) to the PubMed client to raise that limit.
- **Retrieval pipeline** (`src/modules/01-orchestrator/pipeline/run-retrieval.ts`):
  chains structure (P2) -> plan (P3) -> retrieve -> dedupe -> classify (P4 +
  `applyPubmedTypeOverride`) into one function, with each stage returning the shared
  `StageResultSchema` envelope (`shared/domain/run.ts`) so a stage can fail or go
  partial (e.g. a failed plan still lets classification abstain cleanly, rather than
  throwing) without losing output from stages that already succeeded. Wired into
  `POST /api/runs` via a new `createRunAndRetrieve` composition
  (`src/modules/01-orchestrator/pipeline/create-run.ts`) for the intents module 01's
  pipeline table says need it (`algorithm`/`evidence_map`/`comparison`/`fact_lookup`);
  `createRun` itself is unchanged, so its existing unit tests and narrower contract
  (routing only) stayed intact. Live-tested end to end on 2026-10-27, both as a direct
  function call and through the real `next dev` route (`POST /api/runs`) against the
  real Meta API, PubMed and Europe PMC — returned 201 with per-stage statuses and
  retrieval counts; the test run row was deleted from `BenchBark` afterward. **Known
  Day-1 limitation, not a silent one:** this runs the whole chain synchronously inside
  the same request as routing (measured ~13-14s end to end live). Corrected after
  re-checking `docs/DAY0-VERIFICATION.md` §4 (verified against Vercel's own docs):
  function duration is **not** actually at risk yet — Hobby's limit is 300s default
  *and* maximum, well above 13-14s. The real cost today is (a) no incremental
  feedback for the clinician during that wait (module 01's SSE `band_ready` design
  exists exactly for this), and (b) no resumability — module 01's resumable-run
  design (`stage_outputs` persistence) isn't built, so a crashed/disconnected request
  loses the retrieval result entirely and must restart from scratch, burning cost
  again. This will matter more, including for the 300s ceiling, once extract/verify/
  grade/synthesize stages are added on top.
- **Retrieval connectors** (`src/modules/02-retrieval/tools/pubmed.ts`, `europe-pmc.ts`, `crossref.ts`,
  `fetch-url-text.ts`, wired into the tool registry by `register-retrieval-tools.ts`):
  all three REST APIs (PubMed E-utilities, Europe PMC, Crossref) are public and
  unauthenticated; field shapes were verified against live responses, not only docs
  (one real mismatch found and fixed — see `docs/DECISIONS.md`, Europe PMC's `pubType`).
  PubMed respects NCBI's 3 req/s-without-key limit (`src/modules/02-retrieval/tools/rate-limiter.ts`)
  and a 24h in-memory cache (`ttl-cache.ts`, same per-process caveat as the budget
  guard). Module 03's remaining deterministic checks — `checkSourceExists` (DOI via
  Crossref / PMID via PubMed / URL via 2xx), `checkRetraction` (Crossref update-to +
  PubMed publication type + a withdrawal-banner text pattern), and the
  `safetyCritical` keyword-escalation rule — are built on top of these connectors.

## Known gaps (not built yet)

- No CI workflow: lint/typecheck/test run locally only; the RLS test suite above is a
  manual SQL script, not a CI gate.
- No rate limiting, CSP, or output-side prompt-injection suite yet (module 10 items for
  later days). The identifier pre-filter is built; the full 20-fixture injection suite
  is not.
- An end-to-end "ask a question → get a sourced pool" path now exists
  (`POST /api/runs` for `algorithm`/`evidence_map`/`comparison`/`fact_lookup` intents),
  but only for the `pubmed`/`europe_pmc` query families. `guideline` and `web` queries
  from the search plan are recorded as skipped, not executed: `web` needs the Meta
  API's own `web_search` tool wired through an agent (not a plain fetch, which is all
  `execute-plan.ts` does); `guideline`/`local` need `fetch_url_text`'s domain allow-list
  configured (still empty by default) and a local-protocol document pool (module 10/
  documents feature), neither of which exists yet.
- Curation stops at dedupe (`deduplicateCandidates`). `resolveVersions`,
  `selectTopNWithDiversity` and `buildCoverageReport` (module 02 curation) are built
  and unit-tested but not wired into `run-retrieval.ts` — they need candidates grouped
  by issuer+topic first, and nothing in the codebase computes that grouping yet; module
  02's scoring (`scoring/score.ts`) is likewise unwired for the same reason. Source
  classification (`source-classifier`, P4) runs on title/issuer/year/family metadata
  only — no abstract or full text, since fetching full text per candidate before
  dedup/classify would be its own (expensive) stage; this is an honest Day-1
  simplification, not a silent one, and likely lowers classification confidence versus
  real abstract text.
- No `stage_outputs` persistence or SSE streaming: `runRetrievalPipeline` runs
  synchronously inside the `POST /api/runs` request and returns only a per-stage status
  summary; a crashed/timed-out request loses the retrieval result entirely rather than
  resuming from it (module 01's resumable-run design isn't built). This also means the
  ~13-14s measured live latency for `algorithm`/etc. intents is a real risk against
  Vercel's function time limit until streaming/chunked execution exists.
- No Auth UI/flow built — the RLS policies and `getRunForViewer` are ready for
  `auth.uid()`-bearing sessions, but there is no sign-up/sign-in page yet, so every
  request today is effectively anonymous.
- The budget guard is in-memory per server process (resets on restart, not shared
  across instances); the Postgres `budget_ledger` table exists but nothing writes to
  it yet.
