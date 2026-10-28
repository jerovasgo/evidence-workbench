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
- **Retrieval + extraction pipeline** (`src/modules/01-orchestrator/pipeline/run-retrieval.ts`):
  chains structure (P2) -> plan (P3) -> retrieve -> dedupe -> classify (P4 +
  `applyPubmedTypeOverride`) -> extract+verify (P5 + deterministic checks, module 03,
  via `extract-and-verify-pool.ts`) into one function, with each stage returning the
  shared `StageResultSchema` envelope (`shared/domain/run.ts`) so a stage can fail or
  go partial without losing output from stages that already succeeded.
- **Time-to-first-token orchestration** (user-requested, 2026-10-27): `POST /api/runs`
  no longer runs this pipeline itself — it only routes (fast; a live smoke test
  measured ~200ms) and stashes the free text in a new in-memory, single-use
  `pendingRunContext` store (`src/modules/01-orchestrator/server/pending-run-context.ts`,
  same per-process caveat as the budget guard) keyed by the new run's id. The new
  `GET /api/runs/:id/stream` (SSE, `src/app/api/runs/[id]/stream/route.ts`) is what
  actually runs the pipeline, streaming a `stage_started`/`stage_progress` event per
  stage and per source as `extract` processes sources in parallel (bounded
  concurrency, prioritized guideline/systematic-review/RCT first,
  `extract-and-verify-pool.ts`), then one `band_ready` (claims), one `receipt_ready`
  (a real `Receipt` built by `build-receipt.ts`), and a final `done`, persisted via a
  new `RunsRepository.updateRunStatus`. Live-tested end to end on 2026-10-27 through
  the real `next dev` routes against the real Meta API/PubMed/Europe PMC: first SSE
  byte arrived in ~100ms, stages streamed progressively over ~31s total (structure
  2.5s, plan 4.8s, retrieve 1.1s, classify 19.3s, extract 1.8s for 10 sources — all
  lacked fetchable open-access full text in this run, an honest real-world gap, not a
  bug, tracked below), ending in `receipt_ready` + `done`; the run's persisted status
  (`partial`) was confirmed in Postgres and the test row deleted afterward.
  `createRunAndRetrieve` (the old single-call synchronous composition) is kept, not
  deleted, for a future precompute/batch job or test that genuinely wants one
  awaited result with no incremental feedback — `POST /api/runs` no longer calls it.
  **Corrected an earlier overstatement in this file:** re-checking
  `docs/DAY0-VERIFICATION.md` §4 (Vercel's own docs) shows Hobby's function duration
  limit is 300s default *and* maximum — not actually at risk from a ~13-30s pipeline.
  The real cost of the OLD synchronous design was no incremental feedback and no
  resumability, not a hard timeout; this is exactly what the SSE work above now
  addresses for the feedback half.
- **Stage output persistence / resumability** (2026-10-28, user-requested): a new
  `StageOutputsRepository` (`src/modules/01-orchestrator/data/stage-outputs-repository.ts`)
  finally writes to the `stage_outputs` table that existed since Day 1 but nothing
  used. `runRetrievalPipeline` now checks for a usable ('ok'/'partial') prior output
  before running each stage and reuses it instead of recomputing (never resuming
  from a `failed` attempt), and persists every freshly computed stage —
  best-effort: a persistence failure is swallowed, never fails the run. `GET
  /api/runs/:id/stream` only emits its `error` ("nothing to resume") when BOTH the
  in-memory `pendingRunContext` is gone AND no stage output was ever persisted for
  that run; otherwise it resumes with whatever free text it has (possibly none —
  resumed stages never need it). Live-tested 2026-10-28 end to end: streamed a real
  run, cut the connection after `structure`/`plan` completed (`curl --max-time`),
  reconnected to the same run, and confirmed `structure`/`plan` came back marked
  `(resumed)` with no new model calls, while `retrieve`→`extract` ran fresh and
  produced 4 real verified claims from a live NICE STEMI guideline page (reperfusion
  timing, aspirin 300 mg loading dose, avoiding early dual antiplatelet therapy —
  `safetyCritical` correctly raised on all three dosing/treatment claims). Confirmed
  in Postgres and cleaned up afterward. Found and fixed a related robustness gap
  while live-testing: `run-retrieval.ts`'s `planCondition` fallback chain could
  resolve to an empty string on a resume with no free text, which crashed
  `planSearch`'s own input validation instead of failing the `plan` stage gracefully
  — now defaults to a non-empty placeholder in that case.
- **Claim extraction and verification** (module 03, P5 `claim-extractor` +
  `verify-claim.ts`): one agent call per source (passages windowed to ~1,200 tokens
  by `window-text.ts`, a deterministic paragraph-based chunker) proposes claims with
  verbatim quotes; code then runs the deterministic checks from
  `docs/architecture/03-claim-extraction-and-verification.md` — quote-found (exact or
  bounded OCR-fuzzy), locator-valid (claimed `passageId` must be a real passage),
  not-retracted (`checkRetraction`, once per source), numbers-preserved, the dose
  rule (an unverified dose is softened to "per local protocol", not dropped), and the
  safety-critical keyword raise. Live-tested 2026-10-27 against a realistic guideline
  excerpt: extracted 3 correct claims (aspirin dose, oxygen non-recommendation,
  reperfusion timing) with quotes matching verbatim and `safetyCritical` correctly
  raised on the aspirin claim. **Honest, documented gap, not a silent one:**
  `support-judge` (T2, the 8th verification step) isn't built, so no claim produced
  here can reach `support: 'supports'` — every kept claim carries
  `verification.support: 'unknown'`, and `shared/domain/claim.ts`'s
  `VerifiedClaimSchema` was tightened (it only checked `quoteFound` before) to refuse
  such a claim as `verified`. A future UI must treat this module's output as
  drawer-only ("not confirmed"), never a main-view "verified" claim, until
  `support-judge` exists.
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
- **UI MVP scaffold** (module 11, 2026-10-28, user-requested): `pnpm dev`/`pnpm build`
  wired for the first time (previously unwired, CLAUDE.md Commands). Tailwind CSS v4
  (CSS-first `@theme`), Geist Sans/Mono (`geist` package via `next/font`), Motion and
  Radix (`@radix-ui/react-tabs`, `react-dialog`) installed per SPEC §12's stack
  decision — `@radix-ui/react-tabs`/`react-dialog` are used directly rather than
  through the shadcn CLI generator, a scope simplification for Day-2 logged in
  `docs/DECISIONS.md`. Design tokens (`src/app/globals.css`) match SPEC §11 exactly
  (background/surface/border/text/muted/accent/warning/conflict, 10-12px radii,
  150-250ms motion honoring `prefers-reduced-motion`). Two of SPEC §11's six
  screens are built: **(1) Home** (`src/app/page.tsx`) — free-text input + example
  conditions, posts to `POST /api/runs`, routes to the result page; **(2) Result**
  (`src/app/runs/[id]/{page,run-view}.tsx`) — a client hook (`use-run-stream.ts`)
  consumes `GET /api/runs/:id/stream` via `EventSource`, rendering live stage
  progress, a view-tab shell (Radix Tabs: Evidence functional, Algorithm/Map/Matrix/
  Mechanism explicitly "not built yet" placeholders — SPEC §11 "abstain = explained
  state, never an empty screen"), claim cards, an evidence drawer (Radix Dialog:
  verbatim quote, source, locator, grade), and a receipt footer. **Every claim card
  and drawer carries a visible "Not confirmed" chip** — module 03's `support-judge`
  isn't built, so `verification.support` is always `'unknown'`; the UI never
  presents these as verified, matching CLAUDE.md rule 5 and the `VerifiedClaimSchema`
  tightening from 2026-10-27. Live-tested end to end in the browser pane against the
  real Meta API/PubMed/Europe PMC/NICE: submitted a real question, watched stage
  progress stream live (structure→plan→retrieve→classify→extract, including a real
  `classify` failure handled gracefully mid-run), saw 2 real verified-pending-review
  claims render with correct chips, opened the evidence drawer and confirmed the
  verbatim NICE quote/source/locator, confirmed Escape-to-close keyboard
  accessibility, and confirmed a 375px mobile layout has no horizontal overflow; the
  test run was deleted from `BenchBark` afterward. `next build` (production) verified
  clean. **Not built:** Algorithm/Map/Matrix/Mechanism views (their modules don't
  exist), light theme (dark-first only for now), watches/local-pool screens, i18n
  (ES/EN toggle), print stylesheet, and a settings UI for the allow-listed-domains
  follow-up noted above.

## Known gaps (not built yet)

- No CI workflow: lint/typecheck/test run locally only; the RLS test suite above is a
  manual SQL script, not a CI gate.
- No rate limiting, CSP, or output-side prompt-injection suite yet (module 10 items for
  later days). The identifier pre-filter is built; the full 20-fixture injection suite
  is not.
- **Web crawling for `guideline`/`web` queries** (2026-10-28, user-requested): a
  curated default allow-list (`src/modules/02-retrieval/retrieval/default-allowed-domains.ts`
  — CDC, WHO, NICE, AHA/ACC journals, ESC, IDSA, ATS, ACOG, AAP, Cochrane, NCBI
  Bookshelf, MAGIC) feeds a new `findWebSources` step
  (`src/modules/02-retrieval/agents/web-source-finder.ts`): the Meta API's
  `web_search` tool proposes candidate URLs (a thin, budget-checked wrapper, not a
  full `runAgent` call — there's no model-authored JSON to validate; the API already
  returns structured `title`/`url`/`snippet`), code then keeps only URLs that
  `assertSafeUrl` accepts against the allow-list (the model's domain preference is a
  hint only, per `docs/DAY0-VERIFICATION.md`: "domain restriction not documented ...
  filter results in code"), and `fetch_url_text` re-fetches each one for real content
  rather than trusting the search snippet. Wired into `execute-plan.ts` (`web`/
  `guideline` families, previously always skipped) and `fetch-full-text.ts` (so
  `extract` can re-fetch these candidates' own URL, not just Europe PMC). Live-tested
  2026-10-28 end to end through the real SSE route: found real NICE/AHA/ESC guideline
  pages, fetched one successfully, and extracted and verified 2 real claims (bed
  rest, aspirin) with quotes matching verbatim against the live-fetched NICE page —
  the first claims this project has produced that trace to a freshly crawled web
  page rather than PubMed/Europe PMC. `local` family queries are still always
  skipped — no local-protocol document pool (module 10/documents feature) exists.
  **User-requested follow-up, not built:** letting a clinician review/add their own
  trusted domains rather than only this hardcoded default list needs a settings UI
  (module 11), tracked in `default-allowed-domains.ts`'s own comment.
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
- `support-judge` (module 03, T2) isn't built: every claim this pipeline produces
  carries `verification.support: 'unknown'`, never `'supports'` — nothing here can
  satisfy `VerifiedClaimSchema`. No view/UI should treat this module's `Claim[]`
  output as display-ready; it belongs in an evidence drawer marked "not confirmed"
  once a UI exists. There is also no per-sub-question "abstain" decision at this
  layer (module 03's own threshold rule: "≥1 verified claim from a guideline/SR, else
  abstain") — that decision belongs to a view/synthesize stage, not built.
- No Auth UI/flow built — the RLS policies and `getRunForViewer` are ready for
  `auth.uid()`-bearing sessions, but there is no sign-up/sign-in page yet, so every
  request today is effectively anonymous.
- The budget guard is in-memory per server process (resets on restart, not shared
  across instances); the Postgres `budget_ledger` table exists but nothing writes to
  it yet.
