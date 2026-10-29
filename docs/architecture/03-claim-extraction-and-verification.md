# 03 — Claim extraction and verification

## Purpose
Turn passages into structured `Claim`s that carry a **verbatim quote**, and prove each one before it can
be displayed. This module is the trust core of the product: it is where "evidence you can audit" is
earned. Everything shown anywhere in the UI must have passed here.

## Position in the pipeline
`curate → extract → verify → (grade, relate, govern)`.

## Agents

### `claim-extractor` (T1, P5)
- **Input:** one `Source` + its relevant `Passage[]` (windows of ≤1,200 tokens with locator) + the
  sub-questions. One call per source, run in parallel.
- **Output:** `Claim[]` without `verification` (filled by code). Fields: `text` (reader-addressed,
  ≤35 words), `basis`, `actionType`, `conditions[]` (structured), `quote` (verbatim, ≤300 chars),
  `passageId`, `nativeGrade?` (as printed), `safetyCritical` (model proposes; code can raise it).
- **Rules:** one claim = one finding; no merging across passages; no measurements unless the
  quote contains them; copy numbers exactly; if a passage has no finding, return `[]`. Never
  paraphrase inside `quote`; the claim `text` may paraphrase.
- **Tools:** none (passages are in the prompt, tagged). **Limits:** 1 step, 3,000 output tokens, 20 s.
  Large sources are chunked by section and merged in code.

### `support-judge` (T2)
- **Input:** `claim.text`, `claim.conditions`, `quote`, and the **surrounding context** (±800 chars
  around the quote located by code).
- **Output:** `{ support: 'supports'|'partial'|'no'|'unknown', issues: ('negation'|'wrong_scope'|'wrong_threshold'|'wrong_strength'|'out_of_context'|'other')[], note }`.
- **Rules:** judge only against the supplied text; say `unknown` rather than guess; check specifically
  for scope drift (scope, context, comparator), negation and strength mismatch ("may increase"
  vs "increases").
- **Limits:** 1 step, 400 tokens. Batched up to 8 claims per call only if each is independently
  delimited; otherwise one per call.

### `adversary` (T2)
- **Input:** the *set* of claims for a sub-question plus the source pool metadata.
- **Output:** `{ challenges: { claimId, kind: 'contradicted_by_source'|'superseded'|'missing_caveat'|'scope_mismatch', evidenceSourceId?, quote?, note }[] }`.
- **Tools:** `local_search`/cached passages only (no new web access in v1) to look for a **verified
  counter-quote** in the existing pool. A challenge without a counter-quote is recorded as
  `unsubstantiated` and does not change the claim state.
- **Effect:** a substantiated challenge downgrades a claim to `partial` and creates/updates a
  `Relation` (module 05). It never deletes a claim by itself.

## Deterministic verification (code, `src/lib/validators/`)
Run in this order; first failure short-circuits and records the reason.
1. **Exists:** DOI resolves via Crossref or PMID via PubMed or URL returns 2xx with readable text.
2. **Quote found:** normalized match of `quote` inside the *fetched* passage text
   (case/whitespace/hyphenation/ligature normalization; Unicode NFKC; no fuzzy matching above
   Levenshtein ≤2 for OCR noise; if fuzzy used, mark `quoteFuzzy=true` and show the original text in
   the drawer). Exact or normalized-exact is the target.
3. **Locator valid:** the matched span lies inside the claimed `passageId`.
4. **Not retracted/withdrawn:** re-check against retraction data at verification time.
5. **Numbers:** every number/unit in `claim.text` and `conditions` must appear in `quote` (after unit
   normalization); otherwise → drop the number or the claim.
6. **Measurement rule:** if the claim contains a measurement and the quote does not, replace with "per local protocol".
7. **Safety-critical raise:** a rule list (explosive, toxic, corrosive, biohazard, pathogenic,
   radioactive, lethal, "do not mix") can set `safetyCritical=true` regardless of the model.
8. **Support:** `support-judge` result; `no` → drop; `partial` → show with visible caveat; `unknown`
   → keep out of the algorithm, available only in the evidence drawer marked "not confirmed".

**Final states:** `verified` (all pass, support=supports), `partial`, `dropped` (counted in Receipt),
`abstain` for the question when too few verified claims remain (threshold per sub-question: ≥1 verified
claim from a standards-body publication/SR, else abstain).

## Contracts
`Claim` (SPEC §8) with `verification`; `VerificationReport = { claimId, checks: {name, ok, detail}[], final }`;
`Receipt` aggregates counts. The *displayable* set is a typed projection `VerifiedClaim` (compile-time
guard: views accept `VerifiedClaim[]` only, never `Claim[]`).

## Failure modes and fallbacks
| Failure | Handling |
| --- | --- |
| Model paraphrases the quote | Quote not found → claim dropped; track rate per prompt version |
| Quote found but meaning distorted | Caught by support-judge and numbers check; mutation tests (below) guard this |
| PDF text extraction garbles tables | Mark table-derived claims `needs_review`; prefer prose recommendations; keep locator |
| Source text unavailable at verify time | Claim cannot be verified → dropped; never "verified from memory" |
| Judge disagrees across reruns | Run twice; if disagreement → `unknown` |
| Over-dropping (too few claims) | Report in Receipt; do not loosen verification; widen retrieval instead |

## Evaluation
- **Hard invariants (CI):** 100% of displayed claims have `quoteFound`, `exists`, `!retracted`.
- **Mutation tests** (core of this module): programmatically corrupt a verified claim and require the
  pipeline to catch it. Mutations: (a) alter the quote by one word; (b) flip negation in `claim.text`;
  (c) change a number/unit; (d) change scope ("aqueous solution" → "organic solvent"); (e) escalate strength
  ("may increase" → "increases"); (f) attach quote to a different source. Target: (a),(c),(f) caught by
  code 100%; (b),(d),(e) caught by judge ≥90% (report per mutation type).
- **Extraction recall:** hand-annotate all findings in 3 standards-body publications (≈20 each); recall ≥70%,
  precision ≥90% (before verification), reported with the annotator named.
- **Judge calibration:** 60 claims labelled by a subject-matter-expert reviewer; Cohen's κ between judge
  and reviewer ≥0.6; report confusion matrix. Re-run on every prompt version change.
- **Adversary value:** on the 5 planted divergences/superseded cases, ≥3 caught with a verified
  counter-quote; false challenge rate (substantiated but wrong) ≤10% on reviewed sample.
- **Cost/latency:** tokens per verified claim; verification time p50 (parallel).
- **Honest reporting:** README lists sample sizes and who reviewed; targets are goals, not results.

## Build notes
- Write validators and mutation harness **before** the extractor prompt; iterate the prompt against them.
- Keep quote normalization in one module with its own tests (ligatures, soft hyphens, smart quotes).
- Store only the minimal quote and locator, not full text; refetch when re-verification is needed.

## Acceptance
Every claim in any view traces to a verified quote; mutation suite passes thresholds; Receipt counts
(extracted, verified, partial, dropped, abstained) match the DB.
