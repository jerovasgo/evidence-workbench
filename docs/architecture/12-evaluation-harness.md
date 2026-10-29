# 12 — Evaluation harness (cross-cutting)

## Purpose
Prove, with numbers and honest limits, that the system does what it claims: citations exist, quotes are
real, claims are supported, divergences are caught, abstention happens when it should, and the result is
better than a plain chat answer on the dimensions we care about. Evaluation is also a development tool:
prompts are iterated against it.

## Principles
1. **Deterministic checks first; model judges second; humans calibrate the judges.**
2. **Report what we measured, how, on what sample, and who reviewed.** Targets are goals, not results.
3. **Never evaluate on data used to tune prompts** — keep a held-out set (≥5 of the 15 topics).
4. **Everything reproducible:** fixtures recorded, prompt versions pinned, run ids stored.
5. **No personal data, no real institutional protocols** — synthetic only.

## Datasets (`/evals/`, `/data/synthetic/`)
| Set | Content | Size | Built by |
| --- | --- | --- | --- |
| `topics.json` | 15 evaluation topics across fields (10 tuning, 5 held-out) | 15 | you + subject-matter-expert reviewer |
| `gold-sources/` | Must-find sources per topic (ids/DOIs) | ≥3 each | you |
| `gold-claims/` | Hand-annotated findings from 3 standards-body publications | ~60 | you + reviewer |
| `mutations/` | Programmatic corruptions of verified claims | ~200 generated | code |
| `planted-protocol/` | Synthetic local protocol with 5 planted divergences | 1 | you |
| `retraction-fixtures/` | Retracted paper, superseded standards-body publication, duplicates, fake title | ~10 | you |
| `injection/` | Prompt-injection documents and snippets | ≥20 | you |
| `router.jsonl` | Labelled requests for intent routing | 60 | you |
| `watch-feed/` | Versioned feed with planted changes | 6 snapshots | you |
| `mechanism-gold/` | 3–5 pathways/mechanisms with expected edges (from Reactome/PubChem/Rhea) | ~100 edges | you |

## Runner (`pnpm eval`)
- Loads fixtures, runs modules in **offline mode** (recorded HTTP) for deterministic tests and in **live
  mode** for end-to-end metrics (costs money; cap with `EVAL_BUDGET_USD`).
- Outputs `evals/results/<date>-<gitsha>.json` and a Markdown summary table (copied to the README).
- CI runs the offline suite on every push; live suite runs manually before milestones.

## Metrics by layer
| Layer | Metric | Method | Initial target |
| --- | --- | --- | --- |
| Retrieval | Must-find recall; scientific-source share; planted-defect catches | Fixtures | ≥80%; 100%; 100% |
| Verification | Citations exist; quotes found (displayed) | Code | 100%; 100% |
| Verification | Mutation catch rate by type | Mutation suite | code-detectable 100%; judge-detectable ≥90% |
| Support | Judge vs human κ on 60 claims | Human review | ≥0.6 |
| Extraction | Recall/precision vs gold claims | Annotated set | ≥70% / ≥90% |
| Grading | Mapping exactness; estimator within-one-level | Fixtures; Cochrane SoF | 100%; ≥70% (else disable) |
| Governance | Planted divergence classification; silent overrides | Planted protocol | ≥4/5; 0 |
| Algorithm | Invariants; unsupported numbers; node recall vs published flowchart | Code; reviewer | 100%; 0; report |
| Algorithm | Stability (Jaccard over 3 runs) | Re-run | ≥0.8 |
| Map/Matrix | Determinism; fidelity; clustering errors | Snapshots; reviewer | 100%; 100%; ≤10% |
| Mechanism | Quoted edges; xref resolution; precision vs database; hallucination probes | Code; gold | 100%; ≥90%; report; 5/5 abstain |
| Watches | Zero-call when unchanged; planted-change detection; digest faithfulness | Fixtures | 0 calls; 3/3 + 0 FP; 0 violations |
| Security | RLS denials; injection success rate; SSRF blocks | Test suites | 100%; 0; 100% |
| UX | Task success/time; axe violations; Lighthouse | Playwright; light usability | report; 0 critical; budgets |
| System | Time to band (p50/p95); cost per run | Run logs | ≤15 s p50; ≤$0.40 |

## LLM-as-judge policy
- Judges (`support-judge`, `coherence-judge`, optional answer-quality judge) are **product components or
  eval tools, never the sole authority.** Any judge used in reported numbers is calibrated against a
  human-labelled sample and its κ is reported.
- Use a different prompt (and when available a different model tier) for eval judges than for product
  judges to avoid self-agreement bias; randomize option order; run twice and treat disagreement as
  `unknown`.
- Never use a judge to verify existence or quotes (code does that).

## Baseline comparison
- **Design:** same 10 questions (topics/sub-questions) posed to the *same Meta model* in plain chat
  (no retrieval, no verification) and to the pipeline.
- **Measures:** (1) citations produced that do not exist or cannot be located; (2) statements with no
  verifiable source; (3) doses/thresholds not traceable; (4) conflicts surfaced vs hidden. Scored by
  code where possible (existence/quote checks run on the chat answer's citations) and by a reviewer on
  a sample.
- **Reporting:** counts and rates with the denominator; no claims about third-party products.
- **Video-ready:** produce one striking, truthful example (e.g., a plain-chat citation that does not
  exist vs the pipeline's verified one) and the aggregate table.

## Human review protocol
- Reviewer: a clinically trained person (name and role in README; if the founder is also the reviewer,
  say so and note the limitation). Blind to which output came from which system where possible.
- Reviewer forms: claim support (supports/partial/no), divergence classification, algorithm node
  coverage, mechanism edge correctness; each with a short guide and examples.
- Record inter-rater agreement if two reviewers are available (even on a 20-item subset).

## Regression and prompt iteration
- Every prompt has a test bank in `/prompts/<id>/tests/` (input fixtures → expected structured
  properties, not exact text). Changing a prompt requires: version bump, offline suite pass, and the
  relevant live metrics not regressing >5 points (or a DECISIONS note).
- Snapshot the selected sources and verified claim ids per topic; review diffs when they change.
- Cost/latency budgets are tests too: CI fails if a stage's recorded p95 on fixtures exceeds its budget.

## Failure analysis
For every missed target, write a short failure analysis in `evals/FINDINGS.md` (what failed, why,
what we changed, what remains). Judges and reviewers will value honest limits more than inflated
numbers; this also feeds the "what we would do next" slide in the demo.

## Build notes
Stand up the runner and fixtures on Day 1 with 3 topics; extend daily. The mutation suite, planted
protocol, retraction fixtures and injection set are cheap and high-value: build them before polishing
any prompt. Reserve Day 9 morning for the final live run and README table.

## Acceptance
`pnpm eval` reproduces the README table; offline CI is green; baseline comparison, reviewer details and
limitations are documented; held-out topics are reported separately from tuning topics.
