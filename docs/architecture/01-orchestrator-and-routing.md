# 01 — Orchestrator, routing, streaming, persistence

## Purpose
Turn one user request into a verified result, fast, with every intermediate step persisted, resumable
and observable. Decide *what to run* based on intent so that simple requests stay cheap.

## Position in the pipeline
Entry point for everything. Owns stage order, concurrency, budgets, caching, SSE streaming. Calls
modules 02–09. Does not contain domain logic.

## Request lifecycle

```text
POST /api/runs  →  validate (zod) → auth/rate-limit/budget guard → create Run (queued)
  → route (T0) → structure (T0) → [plan → retrieve → curate] → extract → verify → grade/relate/govern
  → synthesize view → invariants → receipt → done
GET /api/runs/:id/stream (SSE)  ← events as stages complete
```

State machine (persisted in `runs.status`): `queued → routing → running → (partial|done|abstained|failed)`.
Each stage writes `stage_outputs(run_id, stage, status, payload_ref, metrics)`; a crashed or timed-out
run resumes from the last `ok` stage. Idempotency key = hash(intent, normalized scenario, setting,
source-version hash, prompt versions).

## Agents

### `router` (T0, P1)
- **Input:** raw text (≤1,500 chars), UI hints (selected mode), user language.
- **Output:** `{ intent, secondary?: intent, condition?, setting?, confidence, reject?: {reason} }`
  with `intent ∈ algorithm|evidence_map|mechanism|fact_lookup|comparison|watch|out_of_scope`.
- **Tools:** none. **Limits:** 1 step, 300 output tokens, 4 s.
- **Rules:** requests naming a specific, identifiable real person (identifiers, "my colleague X…",
  individual advice for a named private individual) → `out_of_scope` with a redirect message; mixed
  requests return `secondary`. Low confidence → ask one clarifying chip set in the UI, never guess
  silently.
- **Pre-filter (code, before the model):** regex/NER-lite for identifiers (national ID patterns, phone,
  email, names after a person-reference cue) → reject with warning. The model is second line of
  defence.

### `scenario-structurer` (T0, P2)
- Converts the topic/scenario into a structured shape: scope, context, key questions
  (≤6 sub-questions), scope parameters (the system under study, stated conditions) as typed chips.
  (2026-10-29 pivot, docs/DECISIONS.md: generalized from a clinical PICO-like shape — population/
  setting/age-pregnancy-renal-function — to any scientific topic.)
- Output is shown to the user as editable chips ("What I'm going to look up") before expensive stages
  when the run is interactive; skipped for precomputed runs and watches.

## Deterministic code
- **Intent → pipeline table** (`src/lib/pipeline/plans.ts`): a constant mapping, not model-chosen.
  | Intent | Stages |
  | --- | --- |
  | algorithm | structure, plan, retrieve, curate, extract, verify, grade, relate, govern, synthesize(algorithm), invariants, receipt |
  | evidence_map / comparison | same, synthesize(map/matrix) |
  | fact_lookup | plan(narrow), retrieve(narrow), extract, verify, answer-card |
  | mechanism | mechanism pipeline (08) |
  | watch | watch-parse (09) |
- **Concurrency manager:** `pLimit`-style bounded pools per resource (Meta API, PubMed, fetch).
  Global per-run cap on in-flight model calls (start at 6; tune on Day 2).
- **Budget guard:** before each agent/tool call, check run cost cap, daily budget, per-user quota; if
  exceeded, stage returns `partial` or `abstain` with reason `budget`.
- **Cache:** key `(topic, context, sourceVersionsHash, promptVersionsHash)` → full result and per
  stage. Source text cached with TTL (not committed). Precomputed set for the evaluation conditions.
- **Streaming:** SSE event types: `stage_started`, `stage_progress`, `band_ready` (10-second band),
  `node_verified`, `view_ready`, `receipt_ready`, `error`, `done`. The band is emitted as soon as the
  red-flag and first-action claims are verified, before the whole graph is done.
- **Resumption:** on `stage_outputs` present and source hash unchanged, skip the stage.
- **Timeouts:** per stage (route 4 s, plan 6 s, retrieve 25 s, extract 40 s, verify 40 s, synthesize
  30 s) tuned on real runs; a stage timeout yields `partial`, not a failed run, when usable output exists.

## Contracts
`Run`, `Receipt` from SPEC §8; `RunEvent` = discriminated union of the SSE events above (zod, shared
between server and client so the UI is type-checked against the stream).

## Failure modes and fallbacks
| Failure | Handling |
| --- | --- |
| Meta API 429/5xx | Backoff with jitter ×3, then `partial`; surface "model busy" in UI |
| One source times out | Continue without it; mark in Receipt `sourcesByKind` and UI footer |
| Invalid model JSON twice | Drop item or abstain; count in `metrics.counts.invalid` |
| Budget exceeded | Stop expensive stages; return what is verified so far, labelled partial |
| Client disconnect | Run continues server-side (resumable); results retrievable by run id |
| Vercel function time limit | Long stages must be resumable chunks or run in the worker (see 09/10); verify plan limits Day 1 |

## Evaluation
- **Router:** 60-item labelled set (10 per intent incl. 10 out-of-scope and 10 mixed). Target:
  ≥90% intent accuracy; 100% of identifiable-person fixtures rejected; 0 out-of-scope requests proceeding
  to retrieval.
- **Orchestrator:** property tests: no stage runs before its inputs exist; every run ends in a terminal
  state; resume after killed process yields same output hash; budget guard never lets cost exceed cap
  by more than one in-flight call.
- **Latency:** time to `band_ready` and to `done` per intent, p50/p95 over the 15 precomputed
  conditions re-run live (target band ≤15 s p50; log honestly if missed).
- **Streaming contract tests:** the client reducer handles every event type, including out-of-order and
  duplicated events.

## Build notes
- Use a small internal state machine rather than a workflow framework; fewer moving parts in 9 days.
- Keep stage functions pure where possible: `(input, ctx) → StageResult`; side effects only via `ctx`.
- Route handlers are thin: validate → enqueue → stream.

## Acceptance
Run for each intent completes or abstains cleanly; kill-and-resume test passes; SSE shows the band
before the full view for algorithm intent; cost and timings recorded for 100% of runs.
