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
  `applyPubmedTypeOverride`) -> extract+verify (P5 + deterministic checks + P10
  `support-judge`, module 03, via `extract-and-verify-pool.ts`) into one function,
  with each stage returning the
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
  raised on the aspirin claim. **Module 03 closed 2026-10-28:** `support-judge` (P10,
  T2, the 8th verification step) is now built (`agents/support-judge.ts`) and wired
  into `extractAndVerifySource` — one call per kept claim, bounded concurrency
  (`MAX_JUDGE_CONCURRENCY = 4`), judging each claim against ±800 chars of surrounding
  passage context (`support-context.ts`). A `'no'` verdict drops the claim;
  `'supports'`/`'partial'` keep it with the real verdict (`applySupportJudgment`,
  `verify-claim.ts`); `'unknown'` (model abstention, or the judge call itself
  timing out/erroring) keeps the claim at the same honest placeholder as before. Live
  end-to-end against the real SSE pipeline and a NICE guideline source: 4 claims all
  reached `support: 'supports'`. The claim-card/evidence-drawer chips and
  `buildReceipt`'s `supported` count were updated to reflect the real verdict instead
  of a hardcoded "Not confirmed" (`docs/DECISIONS.md`, 2026-10-28).
- **Grading and scoring, Parts A and B** (module 04, `src/modules/04-grading-scoring/`,
  started 2026-10-28): **Part A** — deterministic `grade-maps.ts` recognizes a printed
  grade string from four schemes (ACC/AHA Class+LOE, GRADE wording, USPSTF, Oxford
  CEBM) and maps it to `Grade` with `origin: 'source'`; `gradeClaim()` is wired into
  `verify-claim.ts` in place of the old always-`ungraded` placeholder. 49 unit tests
  (≥40-fixture eval target from the architecture doc), plus an integration test
  proving the exact code path the live pipeline uses. **Part B** — `quality.ts`
  (COI/methods penalties from the classifier's own flags) and `applicability.ts`
  (setting-only match/partial/mismatch) are new; `source-score.ts`'s
  `buildSourceScore()` reuses module 02's already-built `computeSourceScore`/
  `computeCurrency`/`LEVEL_WEIGHTS` and is wired into `run-retrieval.ts` right after
  the `classify` stage, riding in the existing `band_ready` SSE event; the evidence
  drawer shows a "Source score — why ranked here" breakdown. Live-verified through
  the real SSE pipeline: `sourceScores` for 36 real classified sources came back with
  correct per-kind level weights and currency values.
  **Known gaps, logged not silent:** `relevance` (one of source-score's five factors)
  still has a fixed 1.0 placeholder — the classifier (P4) isn't given the run's
  sub-questions to judge relevance against, so nothing computes a real value.
  `applicability` only scores **setting**, never population — free-text population
  comparison needs real semantic reading, not a word-overlap heuristic, so it's left
  unscored rather than guessed. `isSuperseded` is always `false` — the classifier's
  one `supersedesOrSupersededBy` string field doesn't say which direction the
  relationship runs, so currency never penalizes it; the classifier schema needs two
  separate fields before this can be scored for real.
  **"No AI-inferred grades" policy (2026-10-28, `docs/DECISIONS.md`):** the
  `grade-estimator` agent (P6) and the `study-data-extractor` it would have needed are
  cancelled, not deferred — the platform will never show a certainty/strength value
  the system itself produced. `grade.origin: 'ai_estimated'` only ever means "no
  formal grade was found," never "the AI estimated one." A claim without a recognized
  printed grade shows a neutral "Not graded" tag (`claim-card.tsx`) or row
  (`evidence-drawer.tsx`) with a fixed explanatory line, never a number or category;
  certainty and strength are labeled independently (`src/lib/i18n/grade-labels.ts`)
  so a printed strength (e.g. ACC/AHA "Class I") still shows even when certainty
  reads "Not graded." An unrecognized-scheme native grade still shows its raw text,
  labeled as unrecognized — traceability isn't lost, only the manufactured certainty
  number is.
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
- **UI, "From evidence to clarity" redesign** (module 11, 2026-10-28, user-specified
  brief, supersedes the first teal-accent UI MVP from earlier the same day):
  `pnpm dev`/`pnpm build` wired for the first time (previously unwired, CLAUDE.md
  Commands). New tokens (pure black, DM Sans, glassmorphism — `src/app/globals.css`,
  logged in `docs/DECISIONS.md` as replacing the original SPEC §11 placeholder
  tokens). Tailwind CSS v4, Motion, and Radix (`@radix-ui/react-tabs`,
  `react-dialog`, `react-dropdown-menu`) used directly rather than through the
  shadcn CLI generator (scope simplification, logged). Two surfaces, both real, not
  mockups:
  - **Landing** (`src/app/page.tsx`): fixed `Navbar` (blur-on-scroll, fixed
    `bg-bg/85` + backdrop-blur once scrolled — fixed live-testing-caught bug: the
    original subtle `.glass` tint let scrolled section headings show through
    illegibly), a `Hero` with the real search bar (submits to `/dashboard`,
    preserving query + mode via URL params) and a `motion`-animated rotating
    suggestion list, then four narrative sections (`HowItWorks`, `VisualizeTabs`
    — four illustrative SVG sketches explicitly labeled "Example — not live data"
    per the brief's own instruction never to present a static demo as a real
    result, `EvidenceTrust`, `FinalCta`).
  - **Dashboard** (`/dashboard`): a conversational workspace, not the old
    single-run page (`/runs/:id` still exists as a direct deep link, now a thin
    wrapper around the shared `RunResult` component). `Sidebar` (collapsible, "New
    research," history grouped by period via `group-by-period.ts`, rename/delete
    through a `conversations-repository.ts`-backed API — fixed a real bug found
    live-testing: the options button was nested inside the conversation's own
    `<button>`, invalid HTML that made Radix's dropdown clicks unreliable; now two
    sibling buttons). `ConversationThread` renders each turn as a full-width
    surface (never a cramped chat bubble, per the brief), reusing `RunResult` for
    the live/streamed answer. `Composer` (floating glass bar) and `EmptyState`
    ("What would you like to understand?") share the same `SearchBar` + mode
    selector as the landing hero. `useConversations` orchestrates list/active
    thread/sending, auto-submitting a query handed off from the landing page.
  - **Mode selector** (Auto/Algorithm/Evidence Map — `src/lib/modes.ts`) only ever
    hints `intent` and picks which result tab opens by default; it never
    fabricates a different visualization per mode, since only the Evidence tab is
    real (brief §6: never invent a visualization to fill a mode).
  Live-tested end to end in the browser pane against the real Meta API/PubMed/
  Europe PMC/NICE: landing hero submit → dashboard auto-start → live stage
  streaming → sidebar updating with the new conversation → switching between 3
  conversations (including one whose run had no resumable state, correctly
  showing the "nothing to resume" error rather than a crash) → a completed run
  with an honest "no claims passed verification" + real receipt. Mobile layout
  (375px) confirmed with no horizontal overflow on both landing and dashboard.
  **Superseded 2026-10-28 by two later passes on the same module** (both logged
  separately above/below): the "which result tab opens by default" line no longer
  applies — the tab switcher itself is gone ("single mode per query" policy); and
  `ConversationThread` now renders a new `TurnResult` (sending/error/ready state
  machine) instead of calling `RunResult` directly (conversational-flow Phase 2).
  Test conversations/runs deleted from `BenchBark` afterward. `next build`
  (production) verified clean, 393 tests pass. **The 375px "no horizontal overflow"
  claim above was true but incomplete** — it checked for overflow, not usability:
  the sidebar had no mobile treatment at all and permanently occupied ~80% of a
  375px screen (no overflow because nothing scrolled past the viewport, just
  everything else squeezed into the remaining sliver). Fixed 2026-10-28 in a
  dedicated mobile-responsiveness pass, logged separately below.
- **Mobile responsiveness pass** (2026-10-28, user-requested, full-platform audit):
  `Sidebar` (`src/components/dashboard/sidebar.tsx`) rewritten as a CSS-breakpoint-
  only off-canvas drawer below `md` (fixed hamburger trigger, `bg-black/60` backdrop,
  closes on backdrop tap / selecting a conversation / new research) — previously the
  only mobile bug on the platform large enough to matter, but a serious one: a fixed
  288px inline column permanently ate ~80% of a 375px screen. Desktop (`md:` and up)
  keeps the exact original static/collapse-to-rail behavior, same component, driven
  entirely by Tailwind's `md:` prefix (no JS media query, no layout hydration
  mismatch risk). Two smaller fixes found in the same pass: `conversation-thread.tsx`
  needed top padding on mobile to clear the new fixed hamburger (the question text
  was rendering underneath it); `src/app/runs/[id]/run-view.tsx`'s header now
  truncates the run id (`min-w-0 truncate`) instead of letting a real ~36-char UUID
  wrap the whole header onto two lines. Live-verified at 375px and the 768px `md`
  boundary across every surface (landing, dashboard empty state, an active
  conversation thread, both dropdown menus, the standalone run page), plus a 1440px
  desktop regression pass; `scrollWidth === clientWidth` (no horizontal overflow)
  confirmed programmatically on the landing page, dashboard and run page at 375px.
- **Latency audit, Phase 1** (2026-10-28, user-requested, diagnosis grounded in this
  session's own real SSE traces): classify (P4) measured 18.6-29.5s — consistently
  the slowest stage, same T0/minimal tier as structure/plan (2.4-5.1s), slow purely
  from batching up to 40 sources into one ~4800-token JSON generation
  (`source-classifier.ts`). Headline fix: `extract-and-verify-pool.ts` already
  computes claims per-source with bounded concurrency and fires `onSourceDone` as
  each finishes, but `src/app/api/runs/[id]/stream/route.ts` discarded that signal
  — every verified claim previously waited for the ENTIRE pipeline (all stages, all
  sources) before one `band_ready` at the end. `band_ready` now sends once per
  contributing source (cumulative claims array); `sourceScores` still rides only the
  final send (not available via a stage callback, and secondary — read only inside
  an opened evidence drawer). Two more fixes: `extractClaims`/`checkRetraction`
  (independent — one doesn't read the other) now run via `Promise.all` instead of
  sequential `await`s; `runAgent`'s `onTrace` (already emitting `{name, ms, costUsd,
  tokens}` per model call, previously wired to nothing) now logs structured JSON
  (`agent_latency`/`stage_latency`/`run_latency`/`first_claims_latency`) so real
  p50/p95 can be computed from server logs going forward — ids/timings/costs only,
  never prompt or scenario text (CLAUDE.md rule 3). **Known gap, not built this
  pass:** splitting classify into smaller concurrent batches (the clear next fix for
  the stage that's actually slowest) — Phase 2, changes the call shape rather than
  just wiring. **Verification gap, logged not silent:** ~6 live attempts this
  session to watch claims stream in progressively all hit 0 claims
  (`no_full_text`/empty retrieval — the same pre-existing variance logged elsewhere
  in this file); the 0-claims path itself was confirmed correct via raw SSE trace
  (no spurious mid-stream sends), and the streaming code reuses the exact
  `event.outcome.claims` array already proven correct elsewhere, but a live run
  showing multiple real claims arriving incrementally was not captured.
  **Both gaps above closed in Phase 2, same session** (next entry).
- **Latency audit, Phase 2** (2026-10-28, user-requested): `classifySourcesBatched`
  (`src/modules/02-retrieval/agents/classify-sources-batched.ts`) splits the classify
  stage's up-to-40-source batch into sub-batches of 10, run with bounded concurrency
  (4 at a time) instead of one serial ~40-source call — `classifySources` (P4) itself
  is untouched, this is a pooling layer on top of it mirroring
  `extract-and-verify-pool.ts`. **Measured, not estimated:** classify dropped from
  the Phase 1 baseline (18.6-29.5s) to 6.3s and 14.1s across two live runs (raw SSE
  timings) — both well below the old range. The same live testing also closed Phase
  1's own logged verification gap: a run that actually produced claims showed
  `band_ready` firing 3 times during a single run (2 claims, then 4 claims, then 4
  claims + sourceScores on the final send) while the UI still showed "Extract &
  verify" as running — the progressive-streaming fix confirmed working as designed,
  not just logically sound. 494 tests pass.
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

## Known gaps (not built yet)

- No CI workflow: lint/typecheck/test run locally only; the RLS test suite above is a
  manual SQL script, not a CI gate.
- No rate limiting, CSP, or output-side prompt-injection suite yet (module 10 items for
  later days). The identifier pre-filter is built; the full 20-fixture injection suite
  is not.
- **User-requested follow-up, not built:** letting a user review/add their own
  trusted domains (beyond the hardcoded default list below) needs a settings UI
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
- `support-judge` (module 03, T2) is now built and wired in (2026-10-28, see above) —
  claims can reach `support: 'supports'` and satisfy `VerifiedClaimSchema`. Still not
  built: there is no per-sub-question "abstain" decision at this layer (module 03's
  own threshold rule: "≥1 verified claim from a guideline/SR, else abstain") — that
  decision belongs to a view/synthesize stage, not built.
- No Auth UI/flow built — the RLS policies and `getRunForViewer` are ready for
  `auth.uid()`-bearing sessions, but there is no sign-up/sign-in page yet, so every
  request today is effectively anonymous.
- The budget guard is in-memory per server process (resets on restart, not shared
  across instances); the Postgres `budget_ledger` table exists but nothing writes to
  it yet.
- UI (module 11) is two of six SPEC §11 screens: Home/Landing and a conversational
  Result/Dashboard. Not built: real Algorithm/Map/Matrix/Mechanism visualizations
  (their modules don't exist — the dashboard no longer shows view tabs at all for
  them, 2026-10-28 "single mode per query" policy, honest one-line notes instead of
  placeholder tabs), a divergence card, watches (list/builder/inbox), a local pool
  screen, light theme (dark-first only), the ES/EN i18n toggle, and a print
  stylesheet for the one-page card. "Continuidad conversacional" (reusing a prior
  turn's already-retrieved sources/claims for a related follow-up, instead of
  re-running retrieval from scratch) is also not built — each turn runs the full
  pipeline independently; the conversational-flow brief's own point 5 asked for
  this, but it needs a real caching/invalidation design (SPEC §9's
  `(topic, context, source-version hash)` cache key is itself still unbuilt)
  beyond what a UI pass can decide on its own.
- Conversation "ownership" is an httpOnly session cookie (one per browser), not a
  real account — no sign-up/sign-in exists (see the Auth gap above). Conversations
  are invisible from a different browser or after clearing cookies; the underlying
  Postgres rows aren't deleted, just unreachable without the original cookie.
- **Module 05 (`relation-labeller`, 2026-10-28) pairs claims by `actionType` +
  `sourceId` + compatible `conditions` only.** `docs/architecture/05-governance-
  local-vs-external.md`'s own pairing heuristic also matches on "semantic key from
  sub-question assignment" — not buildable yet, since `claim-extractor`'s output
  schema doesn't tag a claim with which sub-question it answers. Honest subset, not
  a silent shortcut: documented in `pair-claims.ts` and `docs/DECISIONS.md`. The
  rest of module 05 (governance table, divergence-analyst, local-document upload)
  is also not built — this slice is cross-source relation labelling only, which
  needs no local protocol document.
- **2026-10-29 pivot (docs/DECISIONS.md):** the identifier pre-filter
  (`src/modules/01-orchestrator/validators/identifiers.ts`) was generalized from
  "patient identifiers" to "any specific, identifiable real person" — the cue list
  (`my colleague/coworker/student/co-author <Name>`, plus the original `patient/
  paciente <Name>`) is a best-effort, not exhaustive; same honest false-positive-
  tolerance posture as before. The `safetyCritical` keyword list
  (`validators/safety-critical.ts`) was similarly generalized from clinical hazard
  terms to lab/chemical/biological/physical hazard terms — same "code can only
  raise the flag, never lower it" mechanism, new keyword domain.
