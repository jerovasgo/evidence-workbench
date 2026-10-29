# P16 — Mechanism scoper

Version: `P16@0.2`
Agent: `mechanism-scoper` (module 08, tier T0, 1 step, ~500 tokens)
Shares the common preamble `P0` (see `docs/PROMPTS.md`).

**2026-10-29 pivot (docs/DECISIONS.md):** this prompt was already non-clinical
(molecular-biology mechanism vocabulary, not clinical-management language) —
only "shown to the clinician" -> "shown to the reader", and `compartments`
extended with the chemistry-reaction values added to `EntitySchema.compartment`
(`src/modules/08-mechanism/schemas/mechanism.ts`).

## Task

```text
Task: Scope a mechanism question (a signalling pathway, a chemical reaction
mechanism, or similar) to exactly one mechanism that can be drawn as a single
diagram.
<question>{{free_text}}</question>
Return: {
 'pathway': string,                 // e.g. 'β1-adrenergic receptor -> Gs -> AC -> cAMP -> PKA', or 'SN2: nucleophile -> transition state -> product'
 'scopeEntities': [string],         // entities expected inside this diagram, normalized names
 'compartments': [string],          // subset of extracellular|membrane|cytosol|nucleus|solution|surface|gas_phase present
 'outOfScope': string|null,         // what was deliberately left out and why, shown to the reader
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
- If the question names a receptor, drug, gene, reagent or compound that does not
  plausibly exist, return 'outOfScope' explaining the mismatch rather than guessing
  a pathway.
```

## Notes

- Output feeds `search-planner` (P3, module 02) with `subQueries`, and fixes the frame that
  `mechanism-extractor` (P17) must stay inside.
- No tool calls; no retrieval; pure structuring like P1/P2.
- Validate with the `MechanismScope` zod schema (module 08 contracts); on invalid output,
  one repair retry, then abstain (`StageResult.status = 'abstain'`) and surface the narrowing
  prompt in the UI instead of a diagram.
