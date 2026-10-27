# 00 — Architecture overview

Companion to `docs/SPEC.md`. SPEC says *what* and *why*; these files say *how*, module by module.
If a file here contradicts SPEC, stop and log it in `docs/DECISIONS.md`.

## Reading order for Claude Code

1. `CLAUDE.md`, `docs/SPEC.md` (§3, §4, §8, §9, §10).
2. This file.
3. The module file for the task at hand. Every module file has the same sections:
   Purpose · Position in the pipeline · Agents · Tools · Deterministic code · Contracts ·
   Failure modes · Evaluation · Build notes · Acceptance.

| File | Module |
| --- | --- |
| 01 | Orchestrator, routing, streaming, persistence |
| 02 | Retrieval and curation (search + clean) |
| 03 | Claim extraction and verification |
| 04 | Grading and scoring |
| 05 | Governance: local protocol vs external evidence |
| 06 | Algorithm generator |
| 07 | Evidence map and concordance matrix |
| 08 | Pathophysiology (mechanism) diagrams |
| 09 | Watches (scheduled searches and digests) |
| 10 | Security, privacy, cost control |
| 11 | UI rendering architecture |
| 12 | Evaluation harness (cross-cutting) |

## Core design stance: a pipeline with bounded agents, not a free-roaming agent

- **The orchestrator is deterministic code** (a typed state machine). It decides which stage runs,
  in what order, with what budget. The model never decides to skip verification.
- **Agents live inside stages**, each with: one job, a typed input and output (zod), an allow-list of
  tools, a step budget, a token budget, a timeout, and a stop rule. Anything that can be done by
  code is done by code.
- **Model proposes, code verifies.** Every model output is parsed against a schema. Facts that can
  be checked (quote exists, source exists, not retracted, cross-reference exists, graph is a DAG)
  are checked by code, never by another model.
- **Abstention is a first-class outcome.** Each agent can return `abstain` with a reason; the
  orchestrator propagates it and the UI shows it.
- **Retrieved text is untrusted data.** It is wrapped in tagged blocks, never concatenated into the
  instruction part of a prompt, and outputs that try to follow instructions inside it are rejected
  (see 10).

## Agent taxonomy

| Tier | Typical model (verify ids on Day 1) | Used for |
| --- | --- | --- |
| T0 cheap | Open-weights Muse model via Baseten, low reasoning | route, structure (PICO), search plan, source classification, NL→JobSpec parse |
| T1 standard | Muse Spark, medium reasoning | claim extraction, grading features, relation labelling, mechanism extraction |
| T2 careful | Muse Spark, high reasoning | synthesis, support judge, adversary, coherence judge, divergence rationale |

Agents (names used in code, logs, and traces):

| Agent | Stage | Tier | Module |
| --- | --- | --- | --- |
| `router` | route | T0 | 01 |
| `scenario-structurer` | structure | T0 | 01 |
| `search-planner` | plan | T0 | 02 |
| `retrieval-scout` (bounded loop) | retrieve | T0 | 02 |
| `source-classifier` | curate | T0 | 02 |
| `claim-extractor` | extract | T1 | 03 |
| `support-judge` | verify | T2 | 03 |
| `adversary` | verify | T2 | 03 |
| `grade-estimator` | grade | T1 | 04 |
| `relation-labeller` | relate | T1 | 05 |
| `divergence-analyst` | govern | T2 | 05 |
| `algorithm-synthesizer` | synthesize | T2 | 06 |
| `map-labeller` (labels only) | synthesize | T0 | 07 |
| `mechanism-scoper`, `mechanism-extractor`, `coherence-judge` | mechanism | T0/T1/T2 | 08 |
| `watch-parser`, `digest-writer` | watches | T0/T1 | 09 |

## Shared agent harness (`src/lib/agents/run-agent.ts`)

All agents are invoked through one function so that behaviour is uniform and testable:

```ts
runAgent<TIn, TOut>({
  name: AgentName,
  promptVersion: string,          // e.g. 'P5@0.1'
  tier: 'T0'|'T1'|'T2',
  input: TIn,                     // zod-validated
  outputSchema: ZodType<TOut>,
  tools?: ToolName[],             // allow-list; empty by default
  limits: { maxSteps: number; maxOutputTokens: number; timeoutMs: number; maxCostUsd: number },
  ctx: RunContext                 // runId, abort signal, budget guard, tracer
}): Promise<AgentResult<TOut>>    // { ok: true, value, usage } | { ok: false, reason: 'invalid'|'timeout'|'budget'|'abstain', detail }
```

Behaviour: build prompt from template (P0 preamble + stage prompt + tagged data) → call Meta client with
structured output if supported → validate with zod → on failure, **one** repair retry that feeds back
the validation errors → on second failure return `{ ok: false, reason: 'invalid' }` → the stage turns
that into abstention or drops the item. Records tokens, latency, cost, prompt version in `Run.stages`.
Never logs prompts or document text (log ids and hashes only).

**Verified Meta API constraints (2026-10-26, see `docs/DAY0-VERIFICATION.md`):** use the Responses API
with `muse-spark-1.3`; tiers differ by `reasoning.effort`. Native function calling exists, but
`tool_choice` is `auto` only, so the model may answer without calling a tool and `max_tool_calls` does
not bound function tools: **the harness enforces `maxSteps` itself** and handles plain-text replies.
Structured-output schemas must not be recursive and must have depth ≤ 10: send trees flat
(`nodes[]` + `parentId`) and nest them in code; always validate with zod anyway. Parallel tool calls are
on by default; execute them concurrently and return one result per call id.

## Tool registry (`src/lib/tools/`)

Tools are plain async functions with zod-typed input/output, timeouts, retries with backoff, response
caching, and a per-tool rate limiter. Agents only see the tools on their allow-list.

| Tool | Purpose | Used by | Notes |
| --- | --- | --- | --- |
| `pubmed_search` / `pubmed_fetch` | E-utilities search and records | scout | Use `NCBI_API_KEY` if present; respect rate limits |
| `europe_pmc_search` / `europe_pmc_fulltext` | Open full text for quote checking | scout, verifier | Prefer open-access XML |
| `crossref_lookup` | DOI existence, metadata, update/retraction notices | verifier | Also Retraction Watch data if exposed; verify |
| `web_search` | Meta Model API search grounding (Responses API only; $2.50/1k queries) | scout | Discovery only; no documented domain filter, so filter result URLs against our allow-list in code |
| `fetch_url_text` | Fetch and extract readable text/PDF text | scout, verifier | Allow-list domains for guidelines; size cap; no executing content |
| `local_search` | Full-text over user's pool | scout | RLS-scoped to the user |
| `uniprot_lookup`, `chebi_lookup`, `reactome_query`, `gtopdb_query` | Mechanism xrefs | mechanism pipeline | Check each license before use |
| `store_*` | Persist stage outputs | orchestrator only | Not exposed to agents |

Agents never get write tools, never see secrets, and never call each other directly.

## Contracts

All inter-stage data are the zod schemas in `src/lib/schemas` (SPEC §8). Additional stage envelopes:

```ts
type StageResult<T> = { stage: string; status: 'ok'|'partial'|'abstain'|'failed';
  value?: T; reasons?: string[]; metrics: { ms: number; costUsd: number; counts?: Record<string, number> } };
```

`partial` means degraded but usable (e.g., one source timed out). Downstream stages must handle it.

## Observability

Every run has a trace: stage timings, agent calls (prompt version, tier, tokens, cost), tool calls
(name, ms, cache hit), counts (sources retrieved/kept, claims extracted/verified/dropped), and the
Receipt. Traces store ids and hashes, never content. A dev-only `/runs/[id]` page renders the trace.

## Build order (maps to SPEC §14)

1. Schemas, `runAgent`, Meta client, tool registry skeleton, validators (tests first).
2. Retrieval + curation (02), then extraction + verification (03).
3. Grading (04), relations/governance (05).
4. Algorithm synthesis (06), then map/matrix (07) — both are projections of the same verified graph.
5. Orchestrator streaming (01) and UI (11) grow alongside; do not leave UI to the last day.
6. Watches (09), mechanism (08), evaluation (12) run in parallel with polish.

## Non-goals

No autonomous browsing beyond allow-listed fetches; no agent that edits the repo or data at runtime;
no patient-specific reasoning; no model-generated layout; no cross-user data access.

## Module boundaries (added 2026-10-27, `docs/DECISIONS.md`)

One Next.js app/deploy (SPEC §12 already decided against a monorepo), but organized as
a **modular monolith**: each architecture module is a folder under `src/modules/<NN-name>/`
with exactly one `index.ts` that is its public API; cross-cutting infrastructure used
by three or more modules (Meta client, the `runAgent` harness, module 10's security
primitives, the Supabase client factory, the prompt loader, the tool-registry
mechanism, and the SPEC §8 core entities — Source/Passage/Claim/Grade/Relation/Run/
Receipt — that most modules reference) lives under `src/shared/<package>/`, same rule.

- A file **outside** a package only ever imports its bare specifier (`@/modules/02-retrieval`,
  `@/shared/meta`) — never a path into its internals (`@/modules/02-retrieval/tools/pubmed`).
  Files **inside** a package use ordinary relative imports to their own siblings.
- `shared/*` must never import from `modules/*` (dependency direction runs one way:
  modules depend on shared, never the reverse). `modules/*` may depend on another
  module's public API (e.g. module 03's existence check imports `CrossrefClient`'s type
  from module 02) — that is the intended way two modules interconnect.
- Enforced by `scripts/check-module-boundaries.mjs`, run as part of `pnpm lint`. A
  custom script, not a third-party ESLint plugin: the obvious plugin's own config DSL
  (capture groups, policy precedence) was inconsistently documented even across its own
  docs pages, and a ~100-line script here is fully verifiable with no new dependency.
- Modules without a folder yet (04 grading, 05 governance, 12 evaluation) get one the
  day they're first built, following the same shape — `schemas/`, the module's own
  logic folders, one `index.ts`.

## Prompt numbering (resolves the P-numbers used across the module files)

Full draft text is in `docs/PROMPTS.md` (P0–P15, Spanish notes, prompts written for English output
schemas as in SPEC §8). P16–P18 are written on Day 1.

| Prompt | Purpose | Agent / module |
| --- | --- | --- |
| P0 | Common preamble | all agents |
| P1 | Intent router | `router` (01) |
| P2 | Scenario structuring | `scenario-structurer` (01) |
| P3 | Search plan | `search-planner` (02) |
| P4 | Source classification (features, no score) | `source-classifier` (02) |
| P5 | Claim extraction with verbatim quote | `claim-extractor` (03) |
| P6 | Grading (only if no native grade) | `grade-estimator` (04) |
| P7 | Relations between claims | `relation-labeller` (05) |
| P8 | Divergence: local vs external | `divergence-analyst` (05) |
| P9 | Graph synthesis (algorithm view) | `algorithm-synthesizer` (06) |
| P10 | Support verifier | `support-judge` (03) |
| P11 | Adversary | `adversary` (03) |
| P12 | Answer card | answer card (SPEC §7) |
| P13 | Natural language → JobSpec | `watch-parser` (09) |
| P14 | Change analysis between versions | watches diff (09) |
| P15 | Watch digest (verified data only) | `digest-writer` (09) |
| P16 | Mechanism scoper | `mechanism-scoper` (08) — to write |
| P17 | Mechanism extractor | `mechanism-extractor` (08) — to write |
| P18 | Coherence judge | `coherence-judge` (08) — to write |
| (none) | Map labeller | `map-labeller` (07) — small prompt, to write |

Note: P0–P15 drafts predate the architecture files. Where they differ (e.g., Responses API, flat
schemas, `reasoning.effort` tiers), the architecture files and `docs/DAY0-VERIFICATION.md` win; adapt
the prompt text and bump its version.
