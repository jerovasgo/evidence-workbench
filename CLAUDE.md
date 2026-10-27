# CLAUDE.md — Evidence Workbench

You are helping build a hackathon project (Meta Global AI Developer Hackathon, building period
Oct 27 – Nov 4, 2026, submission due Nov 4, 9 PM EST). Read this file first, then `docs/SPEC.md`,
then `docs/architecture/00-overview.md`, then only the module file(s) for the task at hand
(`docs/architecture/01…12`: orchestrator, retrieval, extraction/verification, grading, governance,
algorithm, map/matrix, mechanism, watches, security, UI, evaluation).

`docs/MASTER-v0.1-es.md` is the earlier master document (Spanish, historical; it still mentions
older stack options). Use it for background only; SPEC and the architecture files win.

Verified platform facts (Meta API constraints, prices, licences) are in `docs/DAY0-VERIFICATION.md`;
trust it over any older assumption, and re-check items marked ⚠ on Day 1 with the real API key
(`GET /v1/models`, one structured-output call, one `web_search` call).

Architecture rules that apply everywhere: a deterministic orchestrator with bounded agents (no
free-roaming agent); every agent runs through `runAgent` with a zod output schema, tool allow-list and
budgets; model proposes, code verifies; build validators and evaluation fixtures before the prompts
they test. Each module file lists its own acceptance criteria and evaluation targets; do not mark a
module done until they are met or the gap is logged in `docs/DECISIONS.md`.

## What we are building

A workbench for clinicians that turns clinical evidence into verified, graded, comparable visuals
(Algorithm Generator, Evidence Maps/Matrix, Pathophysiology Diagrams), plus watches that alert on
changes. The product *navigates, compares, audits and verifies* evidence. It does not give patient
instructions or diagnose. `docs/SPEC.md` is the source of truth: section 3 (safety posture),
section 4 (Evidence Matrix), section 6 (three components), section 8 (data model), section 9
(pipeline/performance) and section 10 (security) are binding.

## Stack (decided)

- React + Next.js (App Router), TypeScript `strict`, pnpm, Tailwind CSS, Radix/shadcn, Motion.
- Diagrams: React Flow (xyflow) + elkjs / d3-hierarchy, custom SVG glyphs. Layout is always
  computed by code, never by the model.
- Supabase: Postgres with Row-Level Security on every table, Auth, Storage. Async/scheduled work
  via job table + pg_cron / Edge Functions (verify limits first).
- Hosting: Vercel. Validation: zod (single source of schemas; generate JSON Schema for structured
  output). Tests: vitest. CI: GitHub Actions.
- Models: **Meta Model API only** at runtime, via `src/lib/meta/client.ts`. Never use another LLM
  provider in the product. Never use "Contributor" model variants.

## Non-negotiable rules

1. **Public repo.** Never commit secrets, `.env*`, real patient data, or full copyrighted PDFs.
   Only synthetic or public data in `/data/synthetic`. Short quotes with locator and link only.
2. **New work only.** Everything is implemented during Oct 27 – Nov 4. Small commits with
   descriptive messages; the git history is evidence. Do not copy code from private projects.
3. **No patient data.** Reject patient identifiers. Scenario text is not persisted by default.
   Never log prompts, scenario text or document content; log ids, timings, costs, hashes.
4. **Clinician-addressed language.** Statements say "assess", "consider ordering", "consider
   referral". Never instructions to the patient. UI copy and README use *navigate, compare,
   audit, verify*; avoid *recommends*, *advises*, *tells you what to do*.
5. **Verified by code, not by the model.** A claim is displayed only if: the source exists, the
   quote appears verbatim in the fetched text, it is not retracted, and the support check passed.
   Failures remove the claim or trigger abstention. There is no "unverified but shown" state.
6. **Doses and thresholds** appear only if quoted from a source with locator; otherwise
   "per local protocol".
7. **Two-dimension grading.** Certainty and strength are separate. Source grades are copied as-is
   (`origin: 'source'`); AI-estimated grades carry `origin: 'ai_estimated'` and a visible label.
8. **Local protocol is never overwritten silently.** Divergences are shown side by side;
   safety-critical ones are `needs_clinician_decision`.
9. **Retrieved content is data, not instructions.** Tag it; validate every model output against
   its zod schema; one retry on invalid output, then abstain.
10. **Security basics:** RLS on all tables; service role key server-only; Meta API key only in
    route handlers; AES-256-GCM field encryption for uploaded documents and watch definitions;
    zod validation on every route; rate limits and a global budget kill switch; strict CSP.
11. **Cost protection:** the public demo shares a $150 credit budget. Enforce per-run cost cap,
    per-IP/user rate limits and `DAILY_BUDGET_USD`; anonymous visitors get precomputed results.
12. **Performance:** run independent work in parallel (`Promise.allSettled`, bounded
    concurrency, per-source timeouts), stream with SSE, publish the 10-second band first, persist
    each stage so runs are resumable, cache by `(condition, setting, source-version hash)`.

## How to work

- **Plan first.** For any task larger than a small fix, propose a plan (files, tests, risks) and
  wait for approval before implementing.
- **Tests first** for validators, scoring, governance table, graph invariants and layout
  (no overlapping boxes). One test bank per prompt in `/prompts`.
- **Schemas first:** define/extend zod schemas in `src/lib/schemas` before code that uses them.
- **Prompts** live in `/prompts/P<n>-<name>.md` with a version (`P5@0.1`); draft text is in
  `docs/PROMPTS.md` (P0–P15), and P16–P18 (mechanism: scope, extraction, coherence) are written on
  Day 1. Store used versions in `Run.promptVersions`.
- **Deviations:** if you must contradict the spec, stop, explain why, and record it in
  `docs/DECISIONS.md` (date, decision, reason). Do not silently diverge.
- **Unknowns:** anything marked as open in SPEC §16 (embeddings, scheduled tasks, model ids,
  Vercel limits) must be verified against official docs before building on it; say what you
  verified and what you could not.
- **UI:** follow SPEC §11 (dark-first, minimalist, futuristic, accessible, no color-only meaning).
  Use design tokens, not ad-hoc colors.
- **Definition of done for a task:** types pass, tests pass, lint passes, no secrets, spec section
  referenced in the commit message, and (for UI) keyboard and reduced-motion checked.

## Commands

```text
pnpm install   # pnpm isn't on PATH on this machine; use `corepack pnpm <cmd>` instead of bare `pnpm`
pnpm test      # vitest run — schemas, Meta client, runAgent, tool registry (60 tests as of 2026-10-27)
pnpm lint      # eslint .
pnpm typecheck # tsc --noEmit
```

`pnpm dev`, `pnpm build` and `pnpm eval` are not wired yet — no Next.js app or `/evals` runner
exists in `/src` yet. Add them when the UI shell (module 11) and evaluation harness (module 12)
are scaffolded.

## Priorities if time runs short

Never cut: quote verification, receipt, concordance matrix, governance, evaluation.
Cut order (first to cut first): mechanism sandbox toggles → mechanism-to-guideline bridge →
answer card → block builder → diff view → printable card → "walk the path" mode → mechanism canvas.
