# 06 — Algorithm generator

## Purpose
Produce a decision pathway a clinician can read in under 10 seconds, built **only from verified
claims**, with explicit abstention where evidence is insufficient. Flagship component #1.

## Position in the pipeline
`govern → synthesize(algorithm) → invariants → receipt`, plus the interactive "walk the path" mode in
the client.

## Agent: `algorithm-synthesizer` (T2, P9)
- **Input:** `VerifiedClaim[]` (with grades, relations, provenance, divergences), the structured
  scenario, setting, and the node/edge schema. Claims are given with stable ids; the model must
  reference ids, never retype claim text as evidence.
- **Output:** `{ nodes: Node[], edges: Edge[], band: { redFlags: nodeId[], firstAction: nodeId, state }, abstentions: {question, reason}[] }`.
- **Rules (in prompt and enforced by code):**
  - Red flags first; every path ends in `disposition` or `abstain`.
  - Each `action` and `test` node cites ≥1 `claimId`; `decision` nodes cite the claims that define the
    threshold; labels ≤12 words; details ≤40 words; clinician-addressed verbs.
  - Edge conditions are structured (`variable/op/value/unit`) so the client can evaluate them.
  - Do not add steps that no claim supports ("common sense" steps are not allowed); if the evidence
    leaves a gap, emit an `abstain` node explaining what is missing.
  - Where sources conflict, emit a branch point with `provenance: 'conflict'` and link both claims;
    never choose silently.
- **Tools:** none. 1 step (+1 repair), 6,000 output tokens, 30 s. For long outputs, generate in two
  passes: (1) skeleton (node ids/types/edges), (2) labels/details per node in parallel — makes streaming
  and repair easier.

## Deterministic code (`src/lib/validators/algorithm.ts`, `src/lib/render/algorithm/`)
**Invariants (all must pass, else repair once, else abstain the whole view with an explanation):**
1. Graph is acyclic except explicit `reassess` back-edges to a defined earlier node (bounded).
2. Exactly one start; red-flag nodes precede non-red-flag nodes on every path.
3. Every leaf is `disposition` or `abstain`.
4. Every `action`/`test` node has ≥1 verified claim; every `claimId` exists in the pool.
5. Edge conditions parse against the structured schema; units normalized.
6. No orphan nodes; ≤ 35 nodes (hard cap) for readability; otherwise split into sub-algorithms.
7. Doses/thresholds present in a node label or detail must appear in a cited claim's quote
   (string/number check) or be replaced by "per local protocol".
8. `provenance` consistent with cited claims (Local/External/Both/Conflict derived by code, not trusted
   from the model).
9. `band` derivable: red flags and first action are real nodes whose claims are verified.

**Derived by code, not the model:**
- Layout (ELK layered, top→bottom) with a collapse tree for branches.
- **10-second band:** top ≤4 red flags + first action + state (`verified|partial|abstain|needs_clinician_decision`).
- **Walk-the-path engine:** user selects generic parameters (chips); a pure function evaluates
  structured edge conditions to highlight/collapse branches. Unknown parameter → both branches stay
  visible with a "needs: <parameter>" hint. The engine never infers values.
- **Node-level state:** worst state among cited claims (e.g., one `partial` ⇒ node shows caveat).

## Streaming behaviour
When the skeleton and the claims for red flags + first action are verified, emit `band_ready`; the
rest of the nodes stream as their claims verify. The client renders nodes progressively with skeleton
placeholders; layout is recomputed only at the end (or incrementally with stable positions to avoid
jumping — prefer: fixed layer order + reserve space).

## Contracts
`Node`, `Edge`, `AlgorithmView = { nodes, edges, band, abstentions, layoutHints }`; shared zod schema is
used for the model's structured output **and** the invariant checker.

## Failure modes and fallbacks
| Failure | Handling |
| --- | --- |
| Model invents a step | Invariant 4/7 fails → repair prompt lists offending node → else node dropped and gap shown as `abstain` |
| Evidence too thin for a full pathway | Produce partial algorithm + abstention nodes; band state `partial` |
| Cyclic or branching explosion | Cap nodes; ask synthesizer to collapse into sub-algorithms by sub-question |
| Conflicting guidelines | Branch with conflict provenance; require clinician decision for safety-critical |
| Too slow | Band first; remaining nodes progressive; fall back to claim list view with the same drawer |

## Evaluation
- **Invariants:** 100% pass on all precomputed conditions (CI check on stored outputs).
- **Faithfulness:** automated — every node's cited claims verified (100%); automated number check that
  no unquoted dose/threshold appears (100%).
- **Coverage vs guideline's own algorithm:** for 3 conditions where a guideline publishes a flowchart,
  clinician reviewer marks matched/missing/extra nodes; report node recall and "unsupported extra"
  count (target extra = 0).
- **Stability:** run each of 5 conditions 3 times; Jaccard similarity of node `claimId` sets ≥0.8;
  report variance honestly.
- **Readability:** the band fits in one screen at 375 px and contains ≤4 red flags + 1 action;
  reviewer timed read-test ("find the first action") on 5 users if possible, otherwise self-test; report.
- **Abstention quality:** on a deliberately sparse condition (synthetic), the system must abstain
  rather than fill; pass/fail.
- **Walk-the-path:** unit tests on the condition evaluator (units, boundaries, missing params).
- **Baseline:** same condition in plain chat vs pipeline → count unsupported/unsourced steps (module 12).

## Build notes
Build invariants and the evaluator with fixtures *before* the synthesizer prompt. Use hand-written
mini-algorithms as test data. Keep P9 versioned; store the version in `Run.promptVersions`.

## Acceptance
Valid algorithm for ≥3 conditions end to end; band shown first; every node opens an evidence drawer
with verified quotes; abstention visible where evidence is insufficient.
