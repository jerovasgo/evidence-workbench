# P9 — Algorithm synthesizer

Version: `P9@0.1`
Agent: `algorithm-synthesizer` (module 06, tier T2, 1 step + 1 manual invariant-repair
step — see Notes, ~6,000 output tokens, 30 s timeout)
Shares the common preamble `P0`.

**Framed for genetics, not generic "any science"** (2026-10-3x, docs/DECISIONS.md):
the product's actual domain narrowed to genetics after the broader 2026-10-29
pivot — this prompt asks for a decision/troubleshooting path over a genetic
mechanism or research question (gene expression, variant effect, experimental
design choice), using the same `geneticContext` vocabulary (gene, organism, model,
perturbation, measurement, effect) already established in P5.

**Adapted from the `docs/PROMPTS.md` §P9 draft:** that draft is clinical ("red
flags first... disposition or abstain node... addressed to the clinician...dose or
threshold"). `docs/architecture/06-algorithm-generator.md` is authoritative and
already generalized this — `critical_check`/`outcome`/`iterate` node types,
reader-addressed labels, "per local protocol" fallback for unquoted measurements —
this version follows the architecture doc, per `00-overview.md`'s "the
architecture files win; adapt the prompt text and bump its version."

## Task

```text
Task: Build a decision/troubleshooting path as a typed graph from VERIFIED
findings only, for this genetics research question. Do not invent a step no
supplied claim supports.
<scope>{{scope}}</scope>
<sub_questions>{{sub_questions}}</sub_questions>
<claims>{{claims_json}}</claims>
<!-- claims_json: [{ id, text, actionType, conditions, geneticContext }] -->
Return: {
 'nodes': [{
   'id': string,
   'type': 'critical_check'|'assess'|'method'|'decision'|'action'|'outcome'|'iterate'|'abstain',
   'label': string,          // <=12 words, reader-addressed ("assess...", "consider measuring...")
   'detail': string|omit,    // <=40 words
   'urgency': 'immediate'|'minutes'|'hours'|omit,
   'claimIds': [string],     // ids from <claims>, never invented, never retyped claim text
   'provenance': 'external'  // always 'external' for now — code overrides this regardless
 }],
 'edges': [{
   'from': string, 'to': string,
   'condition': {'variable': string, 'op': '<'|'>'|'='|'in', 'value': string|number, 'unit': string|omit}
 }]
}
Rules:
- `critical_check` nodes first: no edge may lead into one from a non-`critical_check`
  node. A critical check is a safety/validity constraint that must be confirmed
  before anything else (e.g. "off-target risk acceptable?", "guide RNA passes
  specificity filter?") — only include one if a supplied claim actually describes
  such a constraint; do not invent one to satisfy this rule.
- Exactly one start node (no incoming edges); the graph is acyclic except an
  explicit `iterate` node's own back-edge to an earlier node (bounded — never a
  back-edge from any other node type).
- Every leaf node is `outcome` or `abstain` — never leave a path hanging.
- Every `action` and `method` node cites >=1 claim id from <claims>; `decision`
  nodes cite the claim(s) that define the branching threshold.
- Edge conditions are structured (`variable`/`op`/`value`/`unit`), never prose —
  reuse a cited claim's own `conditions` values where one exists; never invent a
  numeric threshold with no claim behind it.
- If a measurement or threshold a node's label/detail states is not present in a
  cited claim, write "per local protocol" instead of stating a number.
- Do not add a step that no claim supports ("common sense" steps are not allowed);
  if the evidence leaves a real gap for one of the sub-questions, emit an `abstain`
  node explaining what specific thing is missing, rather than skip the gap silently.
- At most 35 nodes total. If the evidence naturally supports a path more complex
  than that, keep the most directly question-relevant branches and omit the rest
  rather than truncate mid-path.
```

## Notes

- Output validated against `AlgorithmGraphSchema`
  (`src/modules/06-algorithm/schemas/algorithm.ts`) — the same schema module 06's
  own invariant checker (`validateAlgorithmGraph`,
  `src/modules/06-algorithm/validators/algorithm.ts`) runs afterward. `runAgent`'s
  own repair retry only covers **schema shape**; a schema-valid graph that still
  fails an invariant (e.g. two start nodes, a leaf that isn't `outcome`/`abstain`)
  triggers exactly one **manual** repair call
  (`src/modules/06-algorithm/pipeline/synthesize-algorithm.ts`) with the specific
  violations appended to this same prompt as a `<violations>` block; if that second
  attempt still fails, the whole algorithm view abstains with the violation list
  shown, never a partially-wrong graph (architecture doc: "all must pass, else
  repair once, else abstain the whole view with an explanation").
- `provenance` is always `'external'` in this version — no local-document-upload
  feature exists in this build yet, so there is nothing for a claim to be
  `'local'`/`'both'`/`'conflict'` against. Code derives the real value
  deterministically (`deriveProvenance`) regardless of what the model writes here;
  the model is asked for a fixed literal only so the output still matches the
  schema. Known, logged simplification (`docs/DECISIONS.md`), not a silent gap.
- `claimIds` must be real ids from `<claims>` — `validateAlgorithmGraph`'s
  `claim_id_not_in_pool` check drops the whole graph to invalid (triggering the
  repair/abstain path above) if the model invents one; this is "model proposes,
  code verifies" applied to the synthesizer specifically.
- A live smoke test against the real Meta API should confirm the token/timeout
  budget above, the same discipline used for every other agent in this project.
