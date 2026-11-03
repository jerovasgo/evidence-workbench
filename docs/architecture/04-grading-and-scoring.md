# 04 — Evidence scoring

## Purpose

Rank retrieved genetics sources transparently without turning a heuristic into a claim-level certainty grade. A source score controls ordering and selection; it never proves that an extracted claim is true.

## Current implementation

`src/modules/04-grading-scoring/scoring/source-score.ts` computes:

`total = relevance × level × quality × currency × applicability`

Each factor is clamped to `[0, 1]`; the total is rounded and exposed with its components. The UI also receives `relevanceReason`, a short explanation of the query features that matched.

### Relevance

Relevance is deterministic and query-aware. The scorer tokenizes the user question and structured subquestions, then weights distinctive genetics entities—genes, proteins and variants—more strongly than generic terms. Title matches count fully; snippet matches count at a reduced weight. Query intent can add a small bonus when the source text contains the corresponding association, mechanism, ranking or comparison vocabulary.

When the question names a distinctive entity and a source contains none of those entities, relevance is capped at `0.3`. An optional relevance signal returned by a connector may contribute 20% of this factor, but cannot replace the locally computed match.

### Evidence level

The source kind supplies a configurable prior: meta-analysis and systematic review rank above individual experiments, while preprints and generic databases receive lower priors. This is a retrieval-ordering heuristic, not a universal hierarchy and not a verdict on an individual result.

### Quality, currency and applicability

- Quality begins at `1.0` and applies explicit penalties for known flags such as missing conflict disclosure or industry-only authorship.
- Currency decays gradually with publication age and penalizes sources marked as superseded.
- Applicability reflects whether the source matches the requested organism, model, experimental context and scope.

All weights live in `src/modules/04-grading-scoring/scoring/config.ts` and changes require tests.

## Deliberate non-features

Genebark does not ask a model to invent a GRADE-like certainty label. A native grade printed by a source may be preserved as metadata; otherwise a claim remains ungraded. Claim support is established separately by quote, number, negation, scope and model-judged semantic support checks.

## UI contract

The Evidence & Sources view must show the total and the factor breakdown on demand. It must label the value as a source-ranking score, never as confidence, truth probability or claim certainty. The explanation must be derived from actual scoring inputs.

## Evaluation

- Unit tests cover monotonicity, currency decay, supersession and factor clamping.
- Named-entity tests verify that irrelevant sources are capped even when generic words overlap.
- Retrieval integration tests verify that the original query and subquestions reach the scorer.
- Future calibration should compare ranking quality against a held-out, human-labelled genetics set and report nDCG/recall at the selection boundary. Until then, weights are an explicit product heuristic.

## Acceptance

Every selected source has a complete `ScoreBreakdown`, an explainable relevance reason and deterministic output for the same inputs. Missing metadata degrades conservatively; it never creates a fabricated value.
