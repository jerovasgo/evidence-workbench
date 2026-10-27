# 02 — Retrieval and curation (search + clean)

## Purpose
Collect the best available sources for a clinical question quickly and in parallel, then clean the
pool: dedupe, resolve versions, exclude retracted or non-scientific sources, rank. Output is a pool of
`Source` + `Passage` objects ready for claim extraction. This is *not* "basic RAG": there is no
embedding-and-stuff step; passages are fetched as whole sections with locators and are verified later.

## Position in the pipeline
`structure → plan → retrieve → curate → (extract)`.

## Agents

### `search-planner` (T0, P-search-plan)
- **Input:** structured scenario (module 01), setting, language, enabled source families.
- **Output:** `SearchPlan = { queries: { family: 'guideline'|'pubmed'|'europe_pmc'|'web'|'local'; text: string; filters?: {...}; purpose: string }[]; mustFind?: string[] }` — at most 12 queries; each `purpose`
  states which sub-question it serves; includes at least one **adversarial query** (e.g., "controversy",
  "not recommended", "discordant guidelines") and one **currency query** (recent updates/withdrawals).
- **Tools:** none. 1 step, 1,200 output tokens.
- **Rules:** use MeSH terms and synonyms for PubMed; include guideline issuers by name where known
  (e.g., major cardiology, emergency, infectious-disease societies) but never invent a guideline title.

### `retrieval-scout` (T0, bounded loop)
- Executes the plan. For each query family a code-level worker runs the tool call; the *scout agent* is
  used only for **gap filling**: after the first parallel wave, it inspects counts and top titles and may
  issue up to 2 follow-up queries (max 3 tool calls each) if a sub-question has no source, or a
  guideline is cited by others but absent from the pool (citation chasing).
- **Tools:** `pubmed_search`, `europe_pmc_search`, `web_search`, `fetch_url_text`, `local_search`.
- **Limits:** 2 rounds, 6 tool calls total, 20 s. Domain allow-list for `fetch_url_text`.
- **Stop rule:** every sub-question has ≥1 guideline or SR source, or limits hit (then flagged in
  Receipt as "thin evidence").

### `source-classifier` (T0)
- **Input:** title, abstract/metadata, first ~1,500 chars. **Output:** `kind`, `issuer`, `year`,
  `appliesTo`, `nativeGradingSystem` guess, `isScientific` (false for blogs/forums/marketing),
  `confidence`. Batched, parallel, ≤40 items/call.
- Code overrides the model when metadata is decisive (PubMed publication types: "Practice Guideline",
  "Systematic Review", "Randomized Controlled Trial").

## Tools and connectors (all in `src/lib/tools/`)
- **PubMed E-utilities** (`esearch`, `efetch`): structured; cache 24 h; respect rate limit (3/s without key).
- **Europe PMC REST:** open full text where available — preferred for quote verification.
- **Guideline sources:** publisher/society pages via `fetch_url_text` from an allow-list; PDFs parsed to
  text with page locators. Only **short quotes with locator** are stored; full text is cached
  transiently and never committed.
- **Web grounding (Meta Model API):** discovery only. Anything found there is re-fetched through
  `fetch_url_text` so the verifier works from the actual page text, not the model's paraphrase.
- **Local pool:** Postgres full-text (`tsvector`) over user documents (decrypted in memory), then
  long-context read of the top 3–5 docs; vectors only if a permitted embedding model is confirmed.

## Parallelism
Wave 1 runs all planned queries concurrently (`Promise.allSettled`, per-family concurrency limits,
per-call timeout 8–10 s). Wave 2 (scout gap fill) is sequential but small. Fetching and classifying
candidates is a second parallel fan-out. Everything streams `stage_progress` counts to the UI.

## Deterministic curation (code)
1. **Normalize identifiers:** DOI lower-case, PMID, URL canonicalization.
2. **Deduplicate:** by DOI/PMID, then by normalized title + first author + year; keep the richest record.
3. **Version resolution:** group guideline versions (same issuer + topic); keep latest as `current`,
   mark older `supersededBy`; keep older only when needed for a "changes" view. Treat updates, focused
   updates and addenda explicitly (child records, not replacements, unless stated).
4. **Retraction/withdrawal check:** Crossref update notices + PubMed "Retracted Publication" /
   "Retraction of Publication" types + guideline "withdrawn/archived" banners found in fetched text.
   Retracted → excluded and listed in Receipt (`retracted` count).
5. **Applicability tagging:** country/setting/population from metadata; mismatch lowers score, never
   silently drops.
6. **Score:** `relevance × level × quality × currency × applicability` (SPEC §8). The model supplies
   *features* (relevance 0–1, quality flags); code multiplies. Weights live in `src/lib/scoring/config.ts`.
7. **Select:** top-N per sub-question with **diversity constraint** (at least 2 issuers where
   available; at most 3 sources from the same issuer) so the pool does not collapse to one opinion.
8. **Coverage report:** per sub-question: sources found, best level, oldest year, "thin" flag.

## Contracts
`SearchPlan`, `CandidateSource`, `Source`, `Passage`, `CoverageReport` (zod). `Passage.locator` is
mandatory (page/section/paragraph); `contentHash` is computed from fetched text.

## Failure modes and fallbacks
| Failure | Handling |
| --- | --- |
| Source behind paywall or no text | Keep as metadata-only; cannot support claims → excluded from extraction, listed as "not readable" |
| Guideline site blocks fetch | Fall back to Europe PMC/PubMed record; if none, mark unavailable |
| Hallucinated guideline in web grounding | Existence check via URL fetch/DOI; no fetch → dropped |
| Pool dominated by one issuer | Diversity constraint; scout asks for alternatives |
| Search returns old versions only | Currency query + version resolution; flag in coverage |
| Non-English sources | Allowed; extraction quotes stay in original language; UI shows original + translated label |

## Evaluation
- **Gold pool:** for each of the 15 evaluation conditions, hand-list ≥3 "must find" sources
  (current major guidelines + landmark SR/RCT). Metrics: recall of must-find in selected pool
  (target ≥80%), share of selected sources that are `isScientific` (target 100%).
- **Planted-defect fixtures:** a retracted paper, a superseded guideline version, a duplicate with
  different DOI formatting, a fake guideline title injected into a mocked web result. Targets: retracted
  excluded 100%; superseded resolved 100%; duplicates merged ≥95%; fake title dropped 100%.
- **Diversity:** % of conditions with ≥2 issuers in selected pool (report).
- **Latency/cost:** time to selected pool p50/p95; sources fetched per run; tokens per classification.
- **Classifier agreement:** 100 labelled records; kind accuracy ≥90% (publication-type override
  counts separately).
- **Regression:** snapshot of selected source ids per condition; diffs reviewed manually on change.

## Build notes
- Connectors first with recorded fixtures (VCR-style) so tests run offline and cost nothing.
- Keep search-plan prompts in `/prompts` with a test bank of 10 conditions → expected query families.
- Treat any new connector as untrusted input: size caps, content-type checks, timeouts.

## Acceptance
For the 15 conditions the pool builds in ≤20 s p50 with coverage reports; planted defects are all caught;
the Receipt shows retrieved/kept/excluded counts with reasons.
