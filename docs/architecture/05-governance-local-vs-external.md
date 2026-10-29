# 05 — Governance: local protocol vs external evidence

## Purpose
Treat the lab's own protocol as a first-class source: read it first, always run the external
search in parallel, compare them claim by claim, classify divergences, and **never override the local
protocol silently**. Also provides the cross-source `Relation` graph used by the matrix.

## Position in the pipeline
`grade → relate → govern → (synthesize)`.

## Inputs and the local pool
- Documents uploaded by the user, encrypted at rest (module 10), with metadata: `type`
  (protocol, pathway, order set, memo), `version`, `approvedAt`, `status` (active/draft/retired),
  `reviewDueAt`, `owner`. Missing metadata → used but labelled **"authority not verified"**.
- Local documents are processed by the same extract/verify pipeline (quote + locator verified); their
  `Source.kind = 'local_protocol'`.
- Demo data: synthetic protocols with 5 planted divergences (module 12).

## Agents

### `relation-labeller` (T1)
- **Input:** pairs of claims about the same question from different sources (pairing by code first:
  same `actionType` + overlapping `conditions` + semantic key from sub-question assignment).
- **Output per pair:** `kind ∈ agrees|differs|supersedes|contradicts|adapts`, `evidence` (ids of the
  two quotes), short `note`.
- **Rules:** label only from the two verified quotes; if scope differs, prefer
  `adapts` or `differs` over `contradicts`; `contradicts` requires opposite direction on the same
  scope and action. Unclear → omit the relation (no relation is better than a wrong one).
- **Limits:** batched ≤10 pairs/call; T1.

### `divergence-analyst` (T2)
- Runs only on `differs|supersedes|contradicts|adapts` involving a local claim.
- **Output:** `divergence = { kind: 'outdated'|'legitimate_adaptation'|'scientific_contradiction',
  requiresExpertReview, suggested: 'local'|'external'|'none', rationale: string[] }` where each
  rationale line cites a claim id/quote.
- **Rules:** uses the **governance table** (code, below) to pre-fill defaults; the model may *argue for*
  a different classification but a deviation from the table's `requiresExpertReview=true` is not
  allowed.

## Governance table (code, `src/lib/scoring/governance.ts`)
Inputs per divergence: local doc status/age, external source level/currency/applicability, claim
`safetyCritical`, certainty gap, whether the external source explicitly supersedes the older version.

| Condition | Classification | Default action |
| --- | --- | --- |
| Local doc older than external publication revision that explicitly changes the item; not safety-critical | `outdated` | suggest `external`; flag for protocol review |
| Local differs by setting/resource constraint documented in local text | `legitimate_adaptation` | suggest `local`; note rationale |
| Opposite direction on same scope/action; both verified | `scientific_contradiction` | `requiresExpertReview = true`; suggest `none` |
| Any divergence where `safetyCritical = true` | any | `requiresExpertReview = true` regardless of other signals |
| Local doc retired/draft | `outdated` | informational only |
| Evidence tie or low certainty on both sides | — | `suggested = 'none'` |

Rules that are never overridden by a model: safety-critical → expert review; local protocol stays
visible and selectable; the external version is added **beside** it, not instead.

## Reading order and parallelism
Local pool is read first for context **and** the external search starts at the same time (never
conditional on local results, to avoid confirmation bias). Governance runs after both are verified.

## UI contract (see 11)
- Provenance chip per claim/node: Local / External / Both / Conflict.
- **Divergence card:** two columns (local quote + locator + doc version; external quote + source +
  grade), classification, rationale bullets, and reviewer controls: *Keep local · Adopt external ·
  Flag for committee* (stored as `decisions` rows; this is the agent-in-the-loop moment).
- Decisions affect the displayed view for that user only and never modify the underlying document.

## Contracts
`Relation` with optional `divergence` (SPEC §8); `Decision = { id, runId, divergenceId, userId, choice,
note, decidedAt }` (RLS: owner only).

## Failure modes and fallbacks
| Failure | Handling |
| --- | --- |
| Local doc too long | Section-wise extraction; only relevant sections to the verifier |
| Local protocol has no verifiable quote | Excluded from comparison; shown as "could not be verified" |
| Mislabelled `contradicts` | Requires two verified quotes + scope match check; otherwise downgrade to `differs` |
| Many weak divergences (noise) | Rank by `safetyCritical`, certainty gap, source level; cap top-N shown, rest in list |
| User wants to override | Allowed via explicit decision; logged; never silent |

## Evaluation
- **Planted divergences:** 5 in a synthetic local protocol (≥1 outdated, ≥1 adaptation, ≥1
  contradiction, ≥1 safety-critical, ≥1 distractor that looks different but is equivalent). Target:
  ≥4/5 correct classification; distractor not flagged as contradiction.
- **Silent override count:** automated check over all runs: 0 cases where a displayed local item
  disappeared or was replaced without a decision record (invariant test in CI).
- **Safety-critical rule:** 100% of divergences touching the safety-critical keyword set have
  `requiresExpertReview=true`.
- **Relation precision:** 40 labelled pairs; precision of `contradicts` ≥85% (prefer low recall).
- **Table unit tests:** every row of the governance table has a test; model output cannot change
  `requiresExpertReview` from true to false (property test).
- **Qualitative:** subject-matter-expert reviewer rates 10 divergence cards for clarity (3-point scale), report.

## Build notes
Build the governance table and its tests first; the model only fills rationale text. Keep relations in
a separate table so the matrix (07) can be built without governance when no local protocol exists.

## Acceptance
Demo with a synthetic local protocol shows all five divergences with correct provenance chips; zero
silent overrides; reviewer decision persisted and reflected in the view.
