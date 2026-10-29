# 07 — Evidence map and concordance matrix

## Purpose
Give the reader an overview of *what the evidence says and who agrees with whom*, as two views of
the same verified claim graph: the **Evidence Map** (radial overview/navigator) and the **Concordance
Matrix** (rows = recommendations, columns = sources; the main comparison tool). Flagship component #2.

## Position in the pipeline
`relate/govern → project (map, matrix)`. Projections are **pure functions of the verified graph**; no
retrieval or verification happens here.

## Key idea: no model-generated structure
The model never emits coordinates, shapes, or edges. Code builds the tree and the matrix; at most a
cheap labeller shortens text.

## Agents
- `map-labeller` (T0, optional): input = list of claim texts under one branch; output = ≤12-word label
  per sub-question/branch and a ≤6-word branch title. Output schema forbids adding facts: code checks that
  each label's content words occur in the underlying claim texts (token-overlap ≥0.6) else falls back to
  a truncation of the original text.
- No other agents. Everything else is code.

## Deterministic projections (`src/lib/projections/`)

### `toMapTree(claimGraph, options) → MapNode`
1. Root = topic/question.
2. Level 1 = sub-questions from the structurer (or, if absent, `actionType` groups: assess, test,
   treat, threshold, disposition, avoid).
3. Level 2 = claims, sorted by (safetyCritical desc, certainty desc, strength desc).
4. Secondary edges = `Relation`s of kind agrees/differs/contradicts/supersedes between claims; hidden
   by default, toggled by a control; max 30 drawn at once.
5. Truncation: ≤7 branches, ~40 visible nodes by default; the remainder is collapsed under "+N more"
   with a count, never dropped.
6. Badges per claim node: certainty pips, strength arrow, provenance chip, verified tick, state
   (`partial` shows a caveat icon).

### `toMatrix(claimGraph, columns) → Matrix`
- Columns: each selected `Source` (standards-body publications; the local protocol as its own column; max 6 at once).
- Rows: **recommendation keys** derived by code: cluster claims by (`actionType`, normalized
  conditions, sub-question). Cluster merge uses structured keys first; where ambiguity remains, the
  `relation-labeller` pairs (module 05) decide equivalence — rows are never created by free text.
- Cell states: `agrees` (same direction), `differs` (different grade/threshold/direction within scope),
  `contradicts`, `absent` (source silent), `n/a` (population/setting excluded). Each cell holds
  `claimId`, grade, short label, quote on hover/expand.
- Row summary: concordance level (all agree, majority agrees, split, single source) computed by code.
- Sort/filter: by safety-critical, by divergence, by certainty gap; "show only disagreements".
- Export: CSV/Markdown of the matrix with citations (quote + locator + source).

### Layout (`src/lib/render/map/`)
- d3-hierarchy `cluster` or ELK radial for the radial map; deterministic given the tree; seeded.
- Collision rules: node boxes never overlap (layout test); label wrap by character budget; ≥8 px gutter.
- Collapse/expand state is client-only; expansion fetches nothing new (data is already loaded).
- Map ↔ product navigation: clicking a branch opens the Algorithm or Matrix scoped to that
  sub-question (map is the navigator, not a separate truth).

## Contracts
`MapNode`, `Matrix` (SPEC §8). Note: `MapNode` is recursive, but the Meta structured-output API rejects
recursive schemas; the only model call here (`map-labeller`) therefore uses a flat
`{ id, parentId, label }[]` schema, and code builds the tree.
Also: `MatrixCell = { state, claimId?, gradeSummary?, note? }`; `ViewOptions`
(zod; part of URL state so views are shareable/restorable).

## Failure modes and fallbacks
| Failure | Handling |
| --- | --- |
| Too many claims → cluttered map | Caps + collapse; matrix always available as a table |
| Two near-duplicate rows | Merge rule on structured key; manual "merge/split" not in v1 |
| Source silent on an item | Cell `absent` (a finding, shown distinctly) |
| Clustering error | Row shows its member claims in the drawer so the user can see why |
| Map unreadable for screen readers | Tree/list fallback (same data), keyboard navigation |

## Evaluation
- **Determinism:** same graph → byte-identical projection (snapshot tests); layout seeded.
- **Fidelity:** every map node and matrix cell maps to a `claimId` that exists and is verified (100%,
  property test); no cell renders a claim not in the pool.
- **Matrix correctness:** hand-built fixture graph with known agreements/disagreements → expected
  cell states 100%; 5 real topics reviewed by the subject-matter-expert reviewer, row-clustering errors counted
  (target ≤10% of rows needing split/merge).
- **Layout:** no overlapping boxes across 20 randomized trees (property test); bounding-box and
  min-gap assertions; performance: layout of 60 nodes <100 ms.
- **Label integrity:** token-overlap check passes for 100% of labels; fallback rate reported.
- **Usability checks:** map opens with ≤7 branches; find-the-disagreement task (matrix filter) takes ≤3
  interactions; keyboard path through the map covered by Playwright; axe finds no critical issues.
- **Export:** CSV round-trip test (columns, escaping, locale-safe numbers).

## Build notes
Matrix first (never cut), map second. Build the projection functions with fixtures from module 05's
planted-divergence protocol. React Flow only renders; it never owns data. Dark-first tokens from SPEC
§11; node shape semantics: rounded rectangle = category, pill = claim, ellipse = open question.

## Acceptance
Map and matrix render from the same graph for ≥3 topics; every node/cell opens the evidence
drawer; disagreements are filterable; layout tests green.
