# Genebark

A workbench for researchers, engineers and students that navigates, compares, audits and verifies
scientific evidence — any field of science, explicitly excluding clinical medicine — with a current
focus on genetics: every claim is tied to a code-verified verbatim quote, graded for certainty, and
shown as an algorithm, evidence map, concordance matrix or mechanism diagram. It does not give
instructions to act on a specific real-world case.

Built for the Meta Global AI Developer Hackathon (Indie track). Design planning (`docs/`) was
written before the building period (Oct 27 – Nov 4, 2026); all application code is written during it.

This README is the human-facing setup guide. `CLAUDE.md` and `docs/` describe the architecture and
the rules the code follows; start there once the app is running.

## Running it locally

The project needs three things: Node/pnpm, a Postgres database (via the Supabase CLI — no cloud
account required), and a Meta API key.

### 1. Prerequisites

- **Node.js 20+** and **pnpm** (`corepack enable` will give you `pnpm` via Node's built-in Corepack;
  if `pnpm` isn't directly on your PATH, use `corepack pnpm <command>` in place of `pnpm <command>`
  everywhere below).
- **Docker Desktop** (or Podman) — running and on your `PATH`. The Supabase CLI uses it to run a
  real local Postgres instance; you do **not** need a Supabase cloud account.
- **Supabase CLI** — `npx supabase --version` works without a separate install (npx fetches it on
  first use); a global install (`npm i -g supabase`) is optional.
- **A Meta API key** for the Meta Model API this project calls at runtime
  (`src/shared/meta/client.ts`) — obtained from the hackathon's Meta API access, per the hackathon's
  own onboarding instructions (not part of this repo).

### 2. Clone and install

```bash
pnpm install
```

### 3. Start a local Supabase instance

```bash
npx supabase start
```

This downloads and starts a local Postgres + Supabase stack in Docker (first run takes a few
minutes), applies every migration in `supabase/migrations/` automatically, and prints a block like:

```text
         API URL: http://127.0.0.1:54321
     Studio URL: http://127.0.0.1:54323
         DB URL: postgresql://postgres:postgres@127.0.0.1:54322/postgres
     anon key: eyJ...
service_role key: eyJ...
```

Keep this terminal's output around — you need the **API URL**, **anon key** and **service_role
key** in the next step. (`http://127.0.0.1:54323` is Supabase Studio, a local web UI for browsing
the database if you want to inspect tables directly.)

If you'd rather point at a Supabase **cloud** project instead of running one locally (e.g. you
already have one from earlier development), skip this step and use that project's own API URL and
keys in step 4 — `supabase/migrations/` applies the same way via `npx supabase db push` once linked
with `npx supabase link`. The local path above is simpler and is what this guide assumes.

### 4. Configure environment variables

```bash
cp .env.example .env.local
```

Fill in `.env.local`:

| Variable | Where it comes from |
| --- | --- |
| `META_API_KEY` | Your Meta API key (step 1). |
| `META_API_BASE_URL` | The Meta Model API base URL (`.env.example` has the real value). |
| `SUPABASE_URL` | The **API URL** `supabase start` printed (`http://127.0.0.1:54321` by default). |
| `SUPABASE_ANON_KEY` | The **anon key** `supabase start` printed. |
| `SUPABASE_SERVICE_ROLE_KEY` | The **service_role key** `supabase start` printed. |
| `APP_ENCRYPTION_KEY` | A 32-byte key, base64-encoded, for AES-256-GCM field encryption (uploaded documents, watch definitions, the ephemeral run-context handoff). Generate one: `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"` |
| `NCBI_API_KEY` | Optional. Without it, PubMed lookups are limited to 3 requests/second (still works, just slower under load). Free from [NCBI](https://www.ncbi.nlm.nih.gov/account/). |
| `DAILY_BUDGET_USD` | A global daily spend ceiling across every run on this process. `.env.example` has a reasonable default. |
| `RUN_COST_CAP_USD` | A per-run spend ceiling. `.env.example` has a reasonable default (raise it if you see "Insufficient unreserved budget" on Algorithm/Mechanism questions — see `docs/DECISIONS.md`, 2026-11-02). |

Never commit `.env.local` — it's already gitignored.

### 5. Run the app

```bash
pnpm dev
```

Open `http://localhost:3000`. The home page and `/dashboard` both work without signing in — there
is no real login flow yet (every run is anonymous today, see `docs/DECISIONS.md`, 2026-10-31).

### 6. Verify it's working end to end

Ask it something — e.g. one of the landing page's own suggested questions, or "How does CRISPR-Cas9
cleave double-stranded DNA?" with the mode selector set to **Mechanism**. You should see research
stages stream in (`Agent activity`), then a verified overview with clickable citations. If you only
see `Could not reach the server` or every claim fails verification, double check `SUPABASE_URL`/
`SUPABASE_SERVICE_ROLE_KEY` match what `supabase start` printed, and that `META_API_KEY` is valid.

## Commands

```text
pnpm install   # install dependencies
pnpm dev       # next dev — run the app locally
pnpm build     # next build — production build
pnpm test      # vitest run — unit tests (a handful of live-model tests are skipped by default)
pnpm lint      # eslint . + module boundary check
pnpm typecheck # tsc --noEmit
```

(`pnpm` not on `PATH`? use `corepack pnpm <command>` instead, as noted above.)

## Stopping / resetting the local database

```bash
npx supabase stop          # stop the local Postgres/Supabase containers
npx supabase db reset      # drop and re-apply every migration from scratch
```

## Project structure

- `docs/SPEC.md` — the product spec (source of truth for behavior).
- `docs/architecture/` — one file per module (`01-orchestrator` … `12-evaluation`).
- `docs/DECISIONS.md` — a dated log of real decisions, bugs found, and why, in the order they
  happened — the most direct way to see how and why the system got to its current shape.
- `CLAUDE.md` — the rules this codebase is built against (architecture, security, non-negotiables).
- `prompts/` — every model prompt used at runtime, each with its own version.
