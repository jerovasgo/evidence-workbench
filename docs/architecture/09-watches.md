# 09 — Watches (scheduled searches and digests)

## Purpose
Let the clinician say, in natural language or with blocks, "watch this topic and tell me when something
that matters changes", and deliver a digest built only from verified data. Cost must be near zero when
nothing changed.

## Position in the system
Separate from the interactive request path. Uses the same retrieval (02), verification (03), grading
(04), and relations (05) modules, executed by a worker on a schedule.

## Agents

### `watch-parser` (T0, P13)
- **Input:** natural-language request + user locale/timezone. **Output:** a candidate `JobSpec` (SPEC §8)
  plus a plain-language preview and a list of **assumptions** the model made (e.g., "weekly", "guidelines
  and PubMed, no web").
- **Rules:** fill only what the user stated; defaults come from a code table, not from the model;
  never schedule faster than the minimum interval; unknown → ask a chip question.
- **Confirmation gate (human-in-the-loop):** the UI shows the preview and requires an explicit
  *Confirm* before saving; nothing is scheduled by the model alone.
- Block builder (UI) produces the same `JobSpec`; the parser is an alternative input method.

### `digest-writer` (T1, P15)
- **Input:** the **verified diff** (new/changed/superseded claims with ids, grades, quotes) — never raw
  sources. **Output:** a digest with ≤5 items: headline (≤20 words), what changed, grade/provenance
  chips (rendered by code), and clinician-addressed implication ("consider reviewing local protocol
  item X").
- **Rules:** may only reference claim/source ids present in the diff; code strips any sentence that
  cites an unknown id; no new facts; empty diff → no digest is generated and no model call is made.

## Scheduler and worker
- **Storage:** `watches` (JobSpec, encrypted fields), `watch_runs` (status, timings, cost, hashes),
  `digests`, `inbox`.
- **Scheduler:** `pg_cron` (or a Vercel-compatible cron hitting a protected route) enqueues due
  watches; a worker claims jobs with `FOR UPDATE SKIP LOCKED` (or pg-boss) — verify Vercel plan limits
  for cron frequency and function duration on Day 1; fall back to Supabase Edge Functions if needed.
- **Idempotency:** `watch_runs` unique on `(watch_id, scheduled_for)`.
- **Limits:** max active watches per user (e.g., 5), max runs/day, per-run cost cap, auto-pause after
  3 consecutive failures, per-user and global budget guard (module 10).

## Change detection (the cost-saving core)
1. For each configured source family, fetch the cheapest **change signal**: PubMed query with
   `edat/mdat` date filter and result count; Europe PMC similar; guideline pages' `ETag`/`Last-Modified`
   or text `contentHash`; local pool document hashes.
2. Compute `signalHash` = hash(sorted ids + hashes + versions). If equal to the previous run → write a
   `watch_run` with `status='unchanged'`, **make zero model calls**, finish.
3. If different → fetch only **new/changed** sources, run classify → extract → verify → grade → relate
   against the **previous verified state** (stored claim graph) to compute a typed diff:
   `added | changed | superseded | retracted | newly_conflicting`.
4. Significance filter (code): ignore changes below thresholds (e.g., only low-level observational
   additions when the user asked for guidelines/SRs) unless the user selected `detailed`.
5. If anything significant remains → `digest-writer` → `digests` + `inbox` item (in-app delivery in v1;
   email/push out of scope).

## Contracts
`JobSpec` (SPEC §8), `WatchRun = { id, watchId, scheduledFor, status: 'unchanged'|'changed'|'failed'|'skipped_budget', signalHash, costUsd, counts }`,
`VerifiedDiff`, `Digest = { id, watchId, items: DigestItem[], receipt }`. `DigestItem` carries
`claimIds` and `sourceIds` only; text is validated against them.

## Failure modes and fallbacks
| Failure | Handling |
| --- | --- |
| Source temporarily down | Skip that source, mark in `watch_run`, retry next cycle; no false "changed" |
| Flapping content (timestamps, ads) | Hash normalized text only (strip boilerplate); minimum change size |
| Digest fatigue | Significance filter; weekly rollup option; max 5 items |
| Budget exhausted | `skipped_budget`; user sees status in watch list |
| Retraction of a previously shown claim | High-priority digest item "previously shown claim retracted" |
| User edits watch | New JobSpec version; previous state kept for diffs unless topic changes |

## Evaluation
- **Zero-call guarantee:** with unchanged fixtures, a counter on the Meta client shows 0 calls and cost
  0 (CI test); signal-only cost per unchanged run reported.
- **Change detection:** fixture feed with planted changes — one new guideline version, one new RCT, one
  retraction, one irrelevant cosmetic page change. Expected: first three detected and typed, fourth
  ignored (target 100% / 0 false positives on fixtures).
- **Digest faithfulness:** 100% of digest items cite ids present in the diff; automated check strips
  and counts violations (target 0 after stripping; track raw violation rate per prompt version).
- **Parser:** 30 NL requests (ES/EN) → JobSpec; field accuracy ≥90%; 100% require confirmation;
  0 schedules faster than the allowed minimum; ambiguous requests produce a question, not a guess.
- **Scheduler:** idempotency under duplicate triggers; skip-locked under 2 concurrent workers;
  auto-pause after N failures (tests).
- **Cost:** average cost per changed run and per unchanged run; projected monthly cost per watch.
- **Demo path:** a deterministic "simulate change" admin switch replays a stored new-version fixture so
  the video does not depend on live sources changing.

## Build notes
Build change detection and the scheduler without any model first; then add parser, then digest-writer.
Verified 2026-10-26: the Meta Model API has no scheduled-task feature, so the job-table + cron/worker
approach is the design, not a fallback.

## Acceptance
A watch created from natural language, confirmed by the user, runs on schedule, makes zero model calls
when unchanged, and delivers a verified digest to the in-app inbox when a planted change appears.
