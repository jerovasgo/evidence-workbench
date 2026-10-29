# 04 — Grading and scoring

**Two standing decisions this file predates (see `docs/DECISIONS.md`):** (1) 2026-10-28, the
`grade-estimator` agent described below was cancelled, not deferred — the platform never
auto-infers a certainty grade; a claim is `ungraded` unless the source prints one. (2) 2026-10-29
pivot: `strength` (clinical recommendation strength) was dropped from `Grade` entirely — no
general-science analog — and the four hardcoded clinical schemes (ACC/AHA, GRADE, USPSTF, Oxford
CEBM) were replaced with one general-science certainty-language mapper
(`src/modules/04-grading-scoring/scoring/grade-maps.ts`). The sections below are kept for their
still-relevant principles (import before estimate, scores vs grades) but the specific schemes,
the estimator agent and the strength dimension are historical, not current.

## Purpose
Give every verified claim an honest certainty grade and every source a transparent score, while
always showing **where the grade came from**: printed by the source, or estimated by the system
(never — see above).

## Position in the pipeline
`verify → grade → relate`. Grading runs only on `verified` or `partial` claims.

## Principles
1. **Import before estimate.** If the source prints a grade (GRADE, ACC/AHA Class/LOE, USPSTF, Oxford
   CEBM, etc.), copy it verbatim into `nativeGrade` and map it to the common scale by a **deterministic
   table**. `origin = 'source'`.
2. **Estimate sparingly.** The system estimates certainty only for systematic reviews/RCTs whose data
   were extracted, with ≥2 judgeable GRADE domains. `origin = 'ai_estimated'`, always labelled, never
   presented as an expert panel. Otherwise `ungraded`.
3. **Two dimensions, never merged.** Certainty (`high…very_low|ungraded`) and strength
   (`for|against` × `strong|conditional`) are independent fields. A strong recommendation with low
   certainty is allowed and common; the UI must show it.
4. **Strength is imported, never estimated.** Strength depends on values, resources and context that
   the system cannot weigh; if the source does not print it, `strength` stays undefined.
5. **Scores rank sources; grades describe claims.** They are separate objects and never combined into
   one "confidence number".

## Deterministic mapping tables (`src/lib/scoring/grade-maps.ts`)
Versioned, unit-tested tables, e.g.:
- ACC/AHA: Class I/IIa/IIb/III(No benefit|Harm) → `strength`; Level A/B-R/B-NR/C-LD/C-EO → `certainty`
  (A→high, B-R→moderate, B-NR→low–moderate by table, C-LD→low, C-EO→very_low).
- GRADE wording: "strong/conditional (weak)" + "high/moderate/low/very low".
- Unknown schemes → `nativeGrade` preserved, `certainty='ungraded'`, label "source scheme not mapped".
Do not invent mappings: each table entry carries a citation to the scheme's own definition (URL +
locator) in a comment, and the table is reviewed by the clinical reviewer.

## Agents

### `grade-estimator` (T1, only when eligible)
- **Eligibility gate (code):** `source.kind ∈ {systematic_review, rct}` and extracted data present
  (sample size, effect, CI, risk-of-bias statement, heterogeneity if SR) and **no native grade**.
- **Input:** structured extraction of the study (from the claim-extractor's extra fields or a second
  pass), restricted to quoted passages.
- **Output:** `domains: { risk_of_bias, inconsistency, indirectness, imprecision, publication_bias }`
  each `{ rating: 'not_serious'|'serious'|'very_serious'|'not_assessable', reason, quote? }` and a
  proposed `certainty`.
- **Code decides the final level:** start high for RCT-based, subtract per domain ratings using the
  GRADE rule table; if fewer than two domains are `not_assessable`-free, result is `ungraded`.
  The model proposes ratings with reasons; code computes the level (so the arithmetic is auditable).
- **Limits:** 1 step, 1,000 tokens, T1.

### `source-score features` (reuses `source-classifier` output, module 02)
Features (relevance, quality flags) come from the model; the score is computed by code.

## Source score (code, `src/modules/04-grading-scoring/scoring/source-score.ts`)
`score = relevance × level × quality × currency × applicability`
- level: meta_analysis 1.00, standards_body/local_protocol 0.90/1.00, SR 0.85, controlled_experiment
  0.70, reference_work 0.60, observational_study 0.45, preprint 0.35, dataset_or_database/other 0.20.
- currency: 1.0 if ≤3 y; linear to 0.5 at 10 y; ×0.2 if superseded; unknown year → 0.7.
- quality: 1.0 default; ×0.8 for no COI statement; ×0.7 for industry-only authorship;
  ×0.85 for not systematic search (standards-body publications); flags come from the classifier
  and are shown.
- applicability: 1.0 matches context/scope; 0.8 partial; 0.6 mismatch.
- All weights in `config.ts`, **initial values to calibrate**; any change requires a test update and a
  DECISIONS entry. Show the factors in the UI tooltip ("why ranked here").

## Contracts
`Grade` from SPEC §8; `ScoreBreakdown = { relevance, level, quality, currency, applicability, total }`.
UI label strings centralised (`src/lib/i18n/grade-labels.ts`): "From source: well-established result"
vs "Not graded".

## Failure modes and fallbacks
| Failure | Handling |
| --- | --- |
| Source uses unfamiliar scheme | Keep native text; `ungraded`; no estimation |
| Native grade missing in quote | Look in the same source's table/summary passage via locator; else `ungraded` |
| Estimator over-rates observational data | Eligibility gate excludes non-SR/RCT |
| Conflicting grades for same recommendation across sources | Show both; matrix highlights `differs`; no averaging |
| Score gaming (new but weak source ranks high) | Level factor dominates; diversity constraint in selection |

## Evaluation
- **Mapping tests:** 100% of fixture strings (≥40 real-format grade strings across schemes) map to the
  expected values; unknown schemes remain `ungraded`.
- **Import fidelity:** on 60 claims from standards-body publications with printed grades, `nativeGrade` equals the printed
  string 100% (string match against quote/locator context).
- **Estimator agreement:** compare AI-estimated certainty to published GRADE certainty (Cochrane
  Summary-of-Findings tables) on ≥10 SR outcomes: report exact agreement and within-one-level agreement
  (goal ≥70% within one level). If below goal, narrow eligibility or disable and say so.
- **Label compliance:** automated UI test that every estimated grade renders the "AI-estimated" badge
  and never the same visual style as source grades.
- **Score sanity:** property tests (monotonicity: newer ⇒ not lower; superseded ⇒ lower; standards_body ≥ controlled_experiment
  all else equal); rank-order review of 5 topics by the subject-matter-expert reviewer.
- **Calibration note:** weights are a design hypothesis, not validated; README must say so.

## Build notes
Implement mapping + score first (pure functions, tests). Estimator is optional and gated by a feature
flag; if time is short, ship with source grades + `ungraded` and keep the label machinery.

## Acceptance
Every shown claim has a grade object with a visible origin; no scheme is guessed; estimator, if enabled,
meets the within-one-level goal or is turned off.
