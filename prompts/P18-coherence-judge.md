# P18 — Coherence judge

Version: `P18@0.1`
Agent: `coherence-judge` (module 08, tier T2, high reasoning)
Shares the common preamble `P0` (see `docs/PROMPTS.md`).

## Task

```text
Task: Judge the coherence of a merged mechanism graph that has already passed deterministic
quote, cross-reference and structural checks. Find issues; do not add content.
<scope>{{pathway}}</scope>
<merged_graph>{{json_with_ids}}</merged_graph>
<quotes>{{quotes_by_interaction_id}}</quotes>
Return: {
 'issues': [{
   'kind': 'missing_step'|'sign_conflict'|'compartment_error'|'orphan'|'overreach',
   'ids': [string],                 // entity or interaction ids this issue is about
   'note': string                   // concrete, cites the quotes/ids involved
 }]
}
Rules:
- You cannot add entities or interactions, only flag problems with what is there.
- 'missing_step': a cascade jumps from step N to step N+2 with no supported intermediate
  and the gap is biologically load-bearing (changes whether downstream signs are valid).
- 'sign_conflict': two sources disagree on the sign of the same edge, or signs along one
  path are inconsistent without a stated branch reason.
- 'compartment_error': an entity's compartment is inconsistent with its kind or with its
  edges (e.g. a membrane receptor interaction drawn with the receptor in the nucleus).
- 'orphan': a second messenger or intermediate with a producer but no consumer (or vice
  versa) in the merged graph.
- 'overreach': an interaction's quote supports a weaker or differently-scoped claim than
  the edge asserts (e.g. quote says 'can modulate' but edge type is 'activates').
- Each issue must cite concrete ids and quote content in 'note'; do not raise an issue you
  cannot ground in the provided graph/quotes.
- Empty 'issues' is a valid, correct answer when the graph is coherent.
```

## Notes

- Downstream effect (module 08): `missing_step`, `sign_conflict`, `compartment_error`,
  `orphan` become visible warnings on the rendered graph; `overreach` additionally
  downgrades that interaction's edge to the "disputed" render style and drops it from
  sandbox propagation until resolved.
- This stage only removes confidence/visibility, never adds an edge — enforced by the
  schema (`issues` has no field that could introduce new graph content) and by the
  orchestrator discarding any output field outside the schema.
- Validate with the `CoherenceReport` zod schema (module 08 contracts); on invalid output,
  one repair retry, then treat as `{'issues': []}` with a logged `partial` status rather
  than blocking rendering (SPEC: abstention/degradation, never silent fabrication).
