# P16 — Mechanism scoper

Version: `P16@0.1`
Agent: `mechanism-scoper` (module 08, tier T0, 1 step, ~500 tokens)
Shares the common preamble `P0` (see `docs/PROMPTS.md`).

## Task

```text
Task: Scope a pathophysiology question to exactly one signalling pathway or mechanism
that can be drawn as a single diagram.
<question>{{free_text}}</question>
Return: {
 'pathway': string,                 // e.g. 'β1-adrenergic receptor -> Gs -> AC -> cAMP -> PKA'
 'scopeEntities': [string],         // entities expected inside this diagram, normalized names
 'compartments': [string],          // subset of extracellular|membrane|cytosol|nucleus present
 'outOfScope': string|null,         // what was deliberately left out and why, shown to the clinician
 'subQueries': [string]             // up to 6 queries for the retrieval stage (02) scoped to this pathway
}
Rules:
- Exactly ONE pathway or mechanism per diagram. If the question spans more than one
  (e.g. 'heart failure pathophysiology'), narrow to the single most relevant pathway and
  say so in 'outOfScope'; do not attempt a multi-pathway diagram.
- Organ-level causal chains (e.g. whole-organ hemodynamics) are out of scope for v1:
  set 'outOfScope' to a narrowing suggestion instead of a pathway, and leave
  'scopeEntities'/'compartments' empty.
- Do not invent entities that are not plausible participants of a named pathway; this
  stage only scopes, it does not assert any interaction (no quotes required here — that
  is P17's job).
- If the question names a receptor, drug or gene that does not plausibly exist, return
  'outOfScope' explaining the mismatch rather than guessing a pathway.
```

## Notes

- Output feeds `search-planner` (P3, module 02) with `subQueries`, and fixes the frame that
  `mechanism-extractor` (P17) must stay inside.
- No tool calls; no retrieval; pure structuring like P1/P2.
- Validate with the `MechanismScope` zod schema (module 08 contracts); on invalid output,
  one repair retry, then abstain (`StageResult.status = 'abstain'`) and surface the narrowing
  prompt in the UI instead of a diagram.
