# Evidence Workbench — SPEC v0.3

Module-level architecture (agents, tools, evaluation) lives in `docs/architecture/00–12`.
Those files refine this one; if they conflict, log it in `docs/DECISIONS.md`.

Working name. Last updated: 2026-10-26. This file is the single source of truth for the build.
Planning for this design was done before the hackathon building period (Oct 27 – Nov 4, 2026);
everything in the repository is implemented during that period. See README for the disclosure.

---

## 1. Product in one paragraph

Evidence Workbench is a workbench for clinicians that turns scattered clinical evidence into
visuals that can be understood in seconds (decision algorithms, evidence maps, concordance
matrices, pathophysiology diagrams). Every claim is tied to a verbatim quote that our code
verifies (the source exists, says that, and was not retracted), graded separately for certainty
and strength of recommendation, and flagged when sources conflict or become outdated. It also
watches topics on the clinician's behalf and alerts only when something changes. It does not tell
anyone what to do with a patient: it shows what the evidence says, how solid it is, and where it
disagrees; when the evidence is thin, it says so.

Tagline: *Evidence you can audit, in seconds.*

## 2. What it offers the clinician

| Need | Typical chatbot answer | Evidence Workbench |
| --- | --- | --- |
| Read in seconds | Paragraphs of prose | 10-second band + visual (algorithm, map, matrix, diagram) |
| Trust a citation | Citations that may not say what is claimed | Quote verified by code; receipt per result |
| Know how strong it is | Uniform confident tone | Certainty and strength graded separately; origin (source vs AI-estimated) visible |
| Compare sources | Blended into one answer | Side-by-side concordance matrix; local protocol vs external guidelines |
| Stay current | Stateless | Watches with change detection; version diffs |
| Know what is unknown | Fills gaps | Explicit abstention |

Primary user: physicians and residents (on-call use). Secondary: protocol/guideline committees.

## 3. Scope and safety posture (non-negotiable)

- **Is:** an evidence navigation, comparison and audit tool for healthcare professionals.
- **Is not:** a source of patient instructions, a diagnostic tool, or a chatbot.
- Management statements are addressed to the clinician ("assess", "consider ordering", "consider
  referral"); never to the patient.
- No patient data. Input is a condition or generic scenario. No patient identifiers are accepted
  (reject and warn). Scenario text is not persisted by default (ephemeral mode).
- Doses and thresholds appear only if quoted from a source with locator; otherwise
  "per local protocol".
- Visible limits statement on every view: reference tool; clinician review required; AI-estimated
  grades are not a GRADE panel.
- The hackathon guide lists "AI to generate and give medical advice" and "basic RAG" as
  anti-projects. Product language, UI copy, README and demo must therefore say *navigate, compare,
  audit, verify* and never *recommend to the patient* or *tells you what to do*.

## 4. The Evidence Matrix (core engine)

Everything the platform shows is derived from one verified structure: the **Evidence Matrix**,
built in four phases.

1. **Search.** Plan queries, retrieve in parallel from guidelines, PubMed/Europe PMC, web
   grounding (Meta Model API) and the user's local document pool.
2. **Appraise.** Classify each source, compute a deterministic source score (type, quality,
   currency, applicability), and grade evidence in two dimensions (certainty; strength).
3. **Compare.** Relate claims across sources (agrees, differs, supersedes, contradicts, adapts);
   run governance for local protocol vs external evidence.
4. **Curate.** Deduplicate, resolve versions, drop retracted or non-scientific sources, verify every
   quote, run support and adversarial checks, and abstain where verification fails.

A **cell** of the matrix = one claim from one source for one clinical question, with: quote,
locator, grade (+origin), verification status, provenance. Rows = clinical questions; columns =
sources (including the local protocol). All views below are projections of this structure.

## 5. Request routing (differential behavior)

An intent router (prompt P1) classifies each request; the system then runs only what is needed.

| Intent | Example | Pipeline | Primary view |
| --- | --- | --- | --- |
| `algorithm` | "Chest pain in the ED: what is the pathway?" | Full matrix → algorithm synthesis | Algorithm + 10-second band |
| `evidence_map` | "What do guidelines say about X vs Y?" | Full matrix → map/matrix | Evidence Map / Matrix |
| `mechanism` | "How does adrenaline act on the cardiomyocyte?" | Mechanism pipeline (§6.3) | Pathophysiology diagram |
| `fact_lookup` | "Troponin threshold in guideline Z" | Targeted retrieval → verify | Answer card |
| `comparison` | "Is A better than B for outcome O?" | Matrix restricted to comparison | Matrix + grading |
| `watch` | "Tell me weekly if sepsis guidelines change" | Parse to JobSpec → confirm → schedule | Watch preview + digests |
| `out_of_scope` | Diagnosis of a specific patient | None | Clear refusal + redirect |

Mixed requests: answer the primary intent first and offer the secondary as a button.

## 6. The three flagship components

### 6.1 Algorithm Generator

- **Purpose:** a decision pathway for a condition that a clinician can read in under 10 seconds,
  with every step backed by verified evidence.
- **Input:** condition or generic scenario; optional setting (ED, inpatient, primary care,
  low-resource) and generic parameters (age group, pregnancy, renal function) entered as chips,
  never as free patient data.
- **Processing:** full Evidence Matrix → synthesis (P9) of a typed DAG from **verified claims
  only** → graph invariants check → receipt.
- **Output:** `Node`/`Edge` graph (§8). Node types: `red_flag`, `assess`, `test`, `decision`,
  `action`, `disposition`, `reassess`, `abstain`. Red flags first; every branch ends in
  `disposition` or `abstain`.
- **UI:** (1) 10-second band: red flags + first clinician action + confidence state; (2) vertical
  flow with two modes — "see all" and "walk the path" (selecting parameters collapses branches
  that do not apply; deterministic rules engine, not the LLM); (3) evidence drawer per node.
- **Verification:** quote found, source exists, not retracted, support check, adversarial check;
  invariants (DAG, single start, structured edge conditions, every `action` has ≥1 claim).
- **Governance:** provenance chip per node (Local / External / Both / Conflict); divergence card;
  `needs_clinician_decision` for safety-critical divergences.
- **Acceptance:** valid algorithm for ≥3 conditions end to end; 100% of shown claims have verified
  quotes; abstention visible when evidence is insufficient.

### 6.2 Evidence Maps (map + concordance matrix)

- **Purpose:** overview and comparison of what the evidence says, source by source.
- **Map view:** radial map. Root = question/condition; level 1 = sub-questions (or action types);
  level 2 = claims with badges (certainty pips, strength arrow, provenance chip, verified tick).
  Cross-relations (agrees/differs) as dashed secondary edges, toggled on demand. Click a branch →
  opens the Algorithm or Matrix for that sub-topic (the map is the navigator of the product).
- **Matrix view (priority):** rows = recommendations/questions; columns = Guideline A, Guideline B,
  Local protocol; cells = agrees / differs / absent with grade and quote. This is the main
  comparison tool and is never cut.
- **Processing:** pure transformation `claimGraph → MapTree` (tested); deterministic layout
  (d3-hierarchy radial or ELK radial); the model never produces coordinates.
- **Name in UI:** "Evidence Map" (not "mind map") to read as audit, not study notes.
- **Limits:** ≤7 branches and ~40 visible nodes by default; labels ≤12 words; long quotes only in
  the drawer; collapsed by default; list-view fallback for screen readers.
- **Acceptance:** map and matrix render from the same graph; no overlapping node boxes
  (layout test); every node opens its evidence drawer.

### 6.3 Pathophysiology Diagrams (mechanism canvas)

- **Purpose:** 2D representation of molecular mechanisms (ligands, receptors, membranes, second
  messengers, kinases, effectors) generated from a natural-language question and grounded in the
  same retrieval and verification system.
- **Core rule:** the model never draws. It proposes a **mechanism graph** (JSON); code validates
  it and renders it from an SVG glyph library with a deterministic layout.
- **Processing:** (P16) scope the request to one signaling pathway/mechanism → (P17) extract
  entities and interactions from retrieved passages with verbatim quotes → deterministic checks →
  (P18) graph-coherence judge → render.
- **Deterministic checks:** quote found; entity cross-references exist (UniProt, ChEBI);
  interaction corroborated by pathway/pharmacology databases when available (Reactome, IUPHAR
  GtoPdb; check each license and attribute before use; avoid KEGG); every second messenger has a
  producer and a consumer; signs are consistent. Edges without support are **not drawn**; they are
  listed as "unsupported".
- **Canvas:** compartment lanes (extracellular, membrane, cytosol, nucleus); glyphs per entity kind
  (ligand, GPCR, RTK, channel, G protein, enzyme, kinase, second messenger, transcription factor);
  ordered step-through animation of the cascade.
- **Sandbox (qualitative):** toggles (add agonist, block receptor, inhibit enzyme, knockout)
  propagate signs along the graph and highlight downstream effects. Effect text comes from code
  templates, each citing the path's edges. Always labelled: *qualitative graph propagation, not
  kinetic simulation*. No doses, no treatment suggestions.
- **Basis:** `background` (context, not a recommendation): no GRADE is shown.
- **Bridge (stretch):** click a node → guideline claims involving drugs acting there, with grades.
- **v1 scope:** one or two canonical pathways (e.g., GPCR → Gs → cAMP → PKA). Organ-level
  pathophysiology (causal chains, e.g., heart failure) is out of v1.
- **Risks:** drifting into an "education chatbot" (mitigate: verified canvas tied to clinical
  evidence); scope (mitigate: thin vertical slice, built only after core is done).
- **Acceptance:** one pathway rendered from a natural-language question with 100% edges quoted,
  ≥3 sandbox toggles, step-through animation.

## 7. Supporting modules

- **Local document pool and governance.** Users upload protocols (synthetic in demo). Documents
  carry metadata (type, version, approval date, status, review date); without it they are used but
  labelled "authority not verified". Retrieval: Postgres full-text + long-context reading of the
  top documents; vectors only if a permitted embedding model exists. Governance never overwrites
  the local protocol silently: divergence classified (outdated / legitimate adaptation / clinical
  contradiction); safety-critical divergences require clinician decision. Reading order is local
  first; the external search always runs in parallel.
- **Watches.** JobSpec from natural language (P13) or a block builder; user confirms a plain
  preview before saving; scheduler runs it; content-hash comparison means **zero model calls when
  nothing changed**; otherwise the pipeline runs only on what is new and a digest (P15) is composed
  from verified data. In-app inbox delivery. Limits: max active watches, max runs/day, cost cap
  per run, auto-pause after N failures.
- **Verification receipt.** Per result: claims total, citations that exist, quotes found,
  retracted, supported, abstained, source mix, oldest source year.
- **Answer card.** For `fact_lookup`, `comparison` and (without the canvas) `mechanism`
  fallbacks; headline ≤25 words, claims, basis, abstention.
- **Auth & settings.** Supabase Auth; language (ES/EN); detail level; site profile (available
  tests/drugs) for resource-aware branches (stretch).

## 8. Data model (zod is the source of truth; TS shown for reference)

```ts
type SourceKind = 'guideline'|'systematic_review'|'rct'|'observational'|'local_protocol'|'pathway_db'|'other';
type Source = { id: string; kind: SourceKind; title: string; issuer?: string; year?: number;
  version?: string; pmid?: string; doi?: string; url: string; accessedAt: string;
  contentHash: string; supersededBy?: string; retracted?: boolean;
  appliesTo?: { country?: string; setting?: string; population?: string };
  nativeGradingSystem?: string };
type Passage = { id: string; sourceId: string; locator: string; text: string }; // cached with TTL
type Grade = { certainty: 'high'|'moderate'|'low'|'very_low'|'ungraded';
  strength?: { direction: 'for'|'against'; level: 'strong'|'conditional' };
  origin: 'source'|'ai_estimated'; nativeGrade?: string;
  domains?: Record<string, { rating: string; reason: string }> };
type Claim = { id: string; text: string; basis: 'recommendation'|'background';
  actionType: 'assess'|'test'|'treat'|'threshold'|'disposition'|'avoid'|'mechanism';
  conditions: { variable: string; op: '<'|'>'|'='|'in'; value: string|number; unit?: string }[];
  sourceId: string; passageId: string; quote: string; grade: Grade;
  verification: { exists: boolean; quoteFound: boolean; retracted: boolean;
                  support: 'supports'|'partial'|'no'|'unknown' };
  safetyCritical: boolean };
type Relation = { from: string; to: string;
  kind: 'agrees'|'differs'|'supersedes'|'contradicts'|'adapts'; evidence: string;
  divergence?: { kind: 'outdated'|'legitimate_adaptation'|'clinical_contradiction';
    requiresClinicianDecision: boolean; suggested: 'local'|'external'|'none'; rationale: string[] } };
// Algorithm view
type Node = { id: string; type: 'red_flag'|'assess'|'test'|'decision'|'action'|'disposition'|'reassess'|'abstain';
  label: string; detail?: string; urgency?: 'immediate'|'minutes'|'hours'; claimIds: string[];
  provenance: 'local'|'external'|'both'|'conflict' };
type Edge = { from: string; to: string;
  condition: { variable: string; op: '<'|'>'|'='|'in'; value: string|number; unit?: string } };
// Evidence map / matrix view
type MapNode = { id: string; kind: 'root'|'subquestion'|'claim'; label: string;
  claimId?: string; children: MapNode[] };
type Matrix = { rows: { question: string; claimByColumn: Record<string, string|null> }[];
  columns: { sourceId: string }[] };
// Mechanism view
type Entity = { id: string; label: string;
  kind: 'ligand'|'receptor'|'channel'|'g_protein'|'enzyme'|'kinase'|'second_messenger'|'transcription_factor'|'other';
  compartment: 'extracellular'|'membrane'|'cytosol'|'nucleus';
  xref?: { uniprot?: string; chebi?: string; go?: string } };
type Interaction = { id: string; from: string; to: string;
  type: 'binds'|'activates'|'inhibits'|'phosphorylates'|'produces'|'degrades'|'opens'|'closes'|'translocates';
  sign: '+'|'-'|'0'; order: number; claimId: string; corroboratedBy?: ('reactome'|'gtopdb')[] };
type MechanismGraph = { scope: string; entities: Entity[]; interactions: Interaction[] };
type Receipt = { claimsTotal: number; citationsExist: number; quotesFound: number; retracted: number;
  supported: number; abstained: number; sourcesByKind: Record<string, number>;
  oldestSourceYear?: number; generatedAt: string };
type Run = { id: string; intent: string; stages: { name: string; ms: number; model?: string; ok: boolean }[];
  receipt: Receipt; costUsd: number; promptVersions: Record<string, string> };
type JobSpec = { id: string; name: string; topic: { condition: string; subquestions?: string[] };
  sources: { guidelines: boolean; pubmed: boolean; web: boolean; localPool: boolean };
  analysis: ('detect_changes'|'grade_new_evidence'|'compare_sources'|'flag_inconsistencies')[];
  schedule: { cron: string; timezone: string }; delivery: { channel: 'in_app'; detail: 'brief'|'standard'|'detailed' };
  limits: { maxCostUsdPerRun: number; maxRunsPerDay: number }; status: 'active'|'paused' };
```

**Invariants (enforced in code before anything is shown):** every displayed `Claim` has
`quoteFound = true`; every `action` node has ≥1 claim; the algorithm graph is acyclic with one
start and red flags first; edge conditions are structured; a dose without a quoted source is
replaced by "per local protocol"; every mechanism `Interaction` has a verified claim.

**Grading rules.** Source grade is imported verbatim (`origin: 'source'`). AI-estimated GRADE only
for systematic reviews/trials with extracted data, always labelled; fewer than two judgeable
domains → `ungraded`. Certainty and strength are separate fields. **Source score** (computed by
code; the model supplies features only): `relevance × level × quality × currency × applicability`
(level: guideline 1.00, SR 0.85, RCT 0.70, observational 0.45, other 0.20; currency 1.0 ≤3y,
decaying to 0.5 at 10y, superseded 0.2; applicability 1.0/0.8/0.6). Initial values, to calibrate.

## 9. Pipeline and performance

Stages: route → structure → plan → retrieve → curate/rank → extract claims → grade & relate →
verify (support + adversarial) → synthesize view → invariants → receipt.

- **Parallelism:** retrieval across sources, per-source classification and per-passage extraction
  run concurrently (`Promise.allSettled`; bounded concurrency; per-source timeouts). Adversarial
  search runs in parallel with support checks.
- **Streaming:** Server-Sent Events from route handlers. Publish the 10-second band (red flags +
  first action) as soon as its claims verify; stream remaining nodes as they verify; show stage
  progress.
- **Async and resumable:** each stage persists its output in `runs`; a run can resume after a
  timeout. Long work (watches, precomputation) runs outside the request path (job table + worker;
  Supabase Edge Functions + pg_cron or a Vercel-compatible equivalent — verify current Vercel
  plan limits for function duration and cron frequency on Day 1).
- **Caching:** by `(condition, setting, source versions hash)`; precompute the 15 evaluation
  conditions; source text cached with TTL (not committed, not persisted long-term).
- **Model tiers:** cheap/open model for routing, structuring, planning, classification; Muse Spark
  with medium reasoning for extraction/grading/relations; high reasoning only for synthesis,
  support verification and adversarial passes.
- **Cost protection (public demo + $150 credits):** per-run cost cap, per-IP and per-user rate
  limits, a global daily budget with a kill switch (env), live runs for signed-in users only,
  anonymous visitors get precomputed results. Log `costUsd` per run.
- **Failure handling:** retries with backoff, single validation retry for malformed model output,
  then abstain; degrade to fewer sources rather than fail.

## 10. Security and privacy

The product avoids sensitive data by design, and still applies baseline controls:

- **Transport and storage:** TLS everywhere; managed Postgres encryption at rest (verify in
  provider docs); private storage buckets with signed URLs.
- **Field-level encryption:** user-uploaded documents and watch definitions are encrypted in the
  application with AES-256-GCM (per-record random nonce; key from `APP_ENCRYPTION_KEY`, server
  only), so they stay protected even if the database is read.
- **Access control:** Supabase Auth (JWT) and **Row-Level Security on every table**; service role
  key only in server code; no client-side secrets; Meta API key only in server route handlers.
- **Data minimization:** no patient data accepted; ephemeral mode by default; no scenario text or
  document content in logs; log only ids, stage timings, costs, hashes.
- **Persistence:** Postgres for sources (metadata + hashes + locators + minimal quotes), claims,
  relations, runs, jobs, digests, documents (encrypted). No full copyrighted texts are stored
  long-term or committed.
- **Application security:** input validation (zod) on every route; prompt-injection defense
  (retrieved content is data, tagged, never executed as instructions; outputs validated against
  schemas); strict CSP and security headers; rate limiting; dependency audit in CI; secret
  scanning in CI.
- **Constant verification and agent-in-the-loop:** verifier and adversarial agents run on every
  output; deterministic validators gate display; humans stay in the loop through explicit
  clinician decisions on divergences, a "mark as reviewed" state, and confirmation before any
  watch is saved.
- **Honesty:** this is a hackathon prototype, not a compliance certification. Production use would
  need a formal data-protection and security review (e.g., Colombia's Law 1581 of 2012; HIPAA if US).

## 11. UI/UX design system

**Direction:** minimalist, futuristic, elegant. Dark-first (light theme supported). Calm, dense
where it matters, nothing decorative that costs legibility.

- **Principles:** speed first (10-second band is the hero); progressive disclosure (band → visual →
  evidence drawer); provenance always one click away; abstain loudly; no color-only meaning.
- **Tokens (initial):** background `#0B0D12`; surface `#12151C`; border `#222733`; text `#E7EAF0`;
  muted `#8B93A7`; accent (single hue) `#4FD1C5`; warning `#F5B544`; conflict `#FF6B6B`.
  Certainty is a luminance ramp of the accent plus four pips and a text label.
- **Type and shape:** Geist Sans + Geist Mono (`next/font`); radius 10–12 px; 1 px borders; minimal
  shadows; glow only on the selected element.
- **Motion:** 150–250 ms ease; branches fan out from the center; step-through animation for
  cascades; honor `prefers-reduced-motion`.
- **Semantics:** certainty pips (4); strength arrows (↑↑ strong for, ↑ conditional for, ↓ against);
  badges "from source" / "AI-estimated"; currency chip ("Guideline 2024, verified today");
  provenance chip (Local / External / Both / Conflict); verification tick. Node shapes carry
  meaning (rounded rectangle = category, pill = claim, ellipse = open question) with a minimal
  legend.
- **Screens:** (1) Home: single input + example conditions; (2) Result: 10-second band, view tabs
  (Algorithm | Map | Matrix | Mechanism), receipt, limits footer; (3) Evidence drawer; (4)
  Divergence card (two versions side by side); (5) Watches (list, builder, inbox); (6) Local pool.
- **States:** loading = stage progress with partial results; abstain = explained state, never an
  empty screen; error = what failed and what still works.
- **Accessibility and i18n:** WCAG AA contrast; keyboard navigation; list/tree fallbacks for
  canvases; ES/EN toggle; mobile-first; print stylesheet for the one-page card.
- **Libraries:** React Flow (xyflow) + elkjs/d3-hierarchy for layouts, Motion for animation,
  Tailwind CSS + Radix/shadcn for primitives.

## 12. Stack, repository layout and deployment

| Layer | Choice | Note |
| --- | --- | --- |
| Frontend | React + Next.js (App Router), TypeScript strict | Server route handlers for the pipeline |
| Styling/UI | Tailwind CSS, Radix/shadcn, Motion | Tokens in §11 |
| Diagrams | React Flow + elkjs, d3-hierarchy, custom SVG glyphs | Deterministic layout |
| Data/Auth | Supabase (Postgres + RLS, Auth, Storage) | pg_cron / Edge Functions for async |
| Hosting | Vercel | Production alias must be public |
| Validation | zod (single source of schemas) | JSON Schema generated for structured output |
| Models | Meta Model API only at runtime (Muse Spark; open-weights model for cheap steps) | Behind `lib/meta/client.ts` |
| Tests | vitest; Playwright optional | Test bank per prompt; tests first for validators |
| CI | GitHub Actions | lint, types, tests, audit, secret scan |
| Package manager | pnpm | |

**Models (verified 2026-10-26, details and sources in `docs/DAY0-VERIFICATION.md`):** Meta Model API,
base `https://api.meta.ai/v1`, OpenAI-SDK compatible; use the **Responses API** with `muse-spark-1.3`
(1M context; $1.25 in / $0.15 cached / $4.25 out per 1M tokens; search grounding $2.50 per 1,000).
Cheap vs careful tiers differ by `reasoning.effort` (`minimal`/`low` → `medium` → `high`). Structured
output via `text.format` (JSON Schema, **no recursive schemas, depth ≤ 10**; send trees flat with
`parentId`). Function tools supported but `tool_choice` is `auto` only. `web_search` grounding works on
the Responses API only and has no documented domain filter. **No embeddings and no scheduled tasks in
the API**: use Postgres full-text + long-context reading, and our own job table. Never use
`*-contributor` ids (they may train on prompts). Wrap everything behind `src/lib/meta/client.ts`.
Muse Spark Open (Baseten) is optional and only if organizers confirm it counts as Meta API use.
Do not put "Meta"/"Muse" in the product name or domain.

**Repository layout — revised 2026-10-27 (logged in `docs/DECISIONS.md`) to a modular
monolith: still one Next.js app/deploy (simpler than a monorepo for 9 days), but each
architecture module's code lives in its own folder with a single `index.ts` public
API; nothing outside that folder imports its internals. See
`docs/architecture/00-overview.md` "Module boundaries" for the rule and
`scripts/check-module-boundaries.mjs` (run by `pnpm lint`) for its enforcement.

```text
/src/app                 routes, UI, SSE endpoints (module 11)
/src/shared/domain       SPEC §8 core entities used by 3+ modules: Source, Passage, Claim, Grade, Relation, Run, Receipt
/src/shared/meta         Meta Model API client
/src/shared/agents       the runAgent harness every module's agents call through
/src/shared/security     module 10 (cross-cutting): encryption, budget guard, SSRF URL guard
/src/shared/supabase     server-only Supabase client factory
/src/shared/prompts      /prompts/P<n>.md loader
/src/shared/tools        the tool registry mechanism (allow-lists); real tool implementations live in their owning module
/src/modules/01-orchestrator   router schema, identifier pre-filter, create-run pipeline, runs repository, per-process runtime
/src/modules/02-retrieval      PubMed/Europe PMC/Crossref/fetch_url_text connectors, curation, scoring
/src/modules/03-extraction-verification   quote/existence/retraction/safety-critical validators
/src/modules/06-algorithm      AlgorithmGraph schema + graph invariants
/src/modules/07-map-matrix     MapNode/Matrix schema
/src/modules/08-mechanism      MechanismGraph schema
/src/modules/09-watches        JobSpec schema
/prompts                 P0–P18 with versions and test banks
/evals                   gold set, planted divergences, baseline comparison
/data/synthetic          synthetic protocols and scenarios (nothing real)
/supabase/migrations     schema + RLS
/docs                    SPEC.md, DECISIONS.md, PROMPTS.md
```

Modules 04 (grading), 05 (governance), and 12 (evaluation) don't have a folder yet —
add `/src/modules/<NN-name>` for each when it's first built, following the same shape.

**Environment variables:** `META_API_KEY`, `META_API_BASE_URL`, `SUPABASE_URL`,
`SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (server only), `APP_ENCRYPTION_KEY` (32 bytes,
base64), `NCBI_API_KEY` (optional), `DAILY_BUDGET_USD`, `RUN_COST_CAP_USD`. Never commit `.env*`.

**Deployment and domain:** the default `*.vercel.app` production URL is enough for the hackathon;
a custom domain is optional polish, not a requirement. Before submitting: open the demo URL in a
private window while signed out and confirm it loads without Vercel login protection; verify the
plan's terms are suitable for this use.

## 13. Evaluation

| Metric | How | Initial target |
| --- | --- | --- |
| Citations that exist | Automatic (PubMed, Crossref, URL fetch) | 100% of displayed |
| Verbatim quotes found | String match on downloaded text | 100% of displayed |
| Claim support | 60-claim sample reviewed by a clinically trained person | ≥ 90% |
| Planted divergences detected | 5 planted in a synthetic local protocol | ≥ 4/5 |
| Silent overrides of local protocol | Automatic | 0 |
| Mechanism edges with quote | Automatic | 100% |
| Mechanism edge precision vs Reactome | 3–5 pathways | Report |
| Time to 10-second band | `runs` stage timings | ≤ 15 s |
| Cost per run | `Run.costUsd` | ≤ 0.40 USD |

**Baseline comparison:** same question to the same Meta model in plain chat vs the pipeline;
compare rate of non-existent or unsupported citations. Do not compare third-party products.
README states who reviewed what, sample sizes, and that targets are goals, not results.

## 14. Plan (Oct 27 – Nov 4) and cut order

| Day | Deliverable |
| --- | --- |
| 1 Tue Oct 27 | Scaffold, schemas, validators, Meta client, Supabase + RLS, tokens/layout shell; credits claimed; open decisions (§16) resolved |
| 2 Wed Oct 28 | Retrieval (PubMed/Europe PMC, open guidelines, web grounding) + curation |
| 3 Thu Oct 29 | Claim extraction (P5) + verification; 15 conditions preloaded |
| 4 Fri Oct 30 | Source classification, scoring, grading |
| 5 Sat Oct 31 | Relations, governance, synthetic local protocol with 5 planted divergences |
| 6 Sun Nov 1 | Algorithm synthesis, support + adversarial verification |
| 7 Mon Nov 2 | UI: band, algorithm, drawer, receipt, matrix, map |
| 8 Tue Nov 3 | Watches + diffs; mechanism canvas v1 (one pathway) |
| 9 Wed Nov 4 | Final evaluation, baseline comparison, 3-minute video, README, submit before 6 PM Bogotá (deadline 9 PM EST) |

**Cut order if time runs out (first to cut first):** mechanism sandbox toggles → bridge from
mechanism to guidelines → answer card → block builder (keep natural language) → diff view →
printable card → "walk the path" mode → mechanism canvas entirely. **Never cut:** quote
verification, receipt, concordance matrix, governance, evaluation.

## 15. Definition of done (for submission)

- Public repository; no secrets, real patient data or full copyrighted texts; README distinguishes
  what was built during the event and states the pre-event planning.
- Deployed demo reachable without sign-in (precomputed) and a live path for signed-in users with
  cost protection.
- 3-minute video showing only what was built during the event, including the baseline comparison.
- Algorithm, Evidence Map/Matrix and at least one Pathophysiology Diagram working end to end.
- Evaluation results in the README with declared limits.

## 16. Open decisions

- Answer in #office-hours about the anti-project question (ask Oct 27; fallback = evidence auditor
  built on the same core, without the algorithm view).
- Resolved on 2026-10-26 (see `docs/DAY0-VERIFICATION.md`): model ids, pricing, structured output,
  tools, search grounding; no embeddings, no native scheduling. Still open: whether Baseten-served
  Muse Spark Open counts as Meta API use; GtoPdb share-alike/commercial terms (keep optional).
- Vercel plan limits (function duration, cron frequency) vs Supabase-based scheduling.
- Final list of 15 evaluation conditions; clinically trained reviewer for the sample.
- Final product name.
