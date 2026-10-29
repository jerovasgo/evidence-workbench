# P17 — Mechanism extractor

Version: `P17@0.2`
Agent: `mechanism-extractor` (module 08, tier T1, 1 step + 1 repair, ~4,000 tokens, run in
parallel per source and merged in code)
Shares the common preamble `P0` (see `docs/PROMPTS.md`).

**2026-10-29 pivot (docs/DECISIONS.md):** this prompt was already non-clinical
molecular-biology vocabulary — kept as-is and extended with a parallel
chemistry-reaction vocabulary (`reactant`/`catalyst`/`intermediate`/`product`/
`transition_state` entities; `forms_bond`/`breaks_bond`/`transfers_electron`/
`catalyzes` interactions), so the same mechanism canvas covers both chosen
demo domains (biology/genetics and chemistry).

## Task

```text
Task: Extract a mechanism graph that this passage explicitly supports, for the given scope.
<scope>{{pathway}} | entities: {{scopeEntities}} | compartments: {{compartments}}</scope>
<retrieved source_id='{{id}}' locator='{{section_or_page}}'>{{passage}}</retrieved>
Return: {
 'entities': [{
   'id': string,                     // stable slug, e.g. 'beta1_adrenergic_receptor'
   'name': string,                   // normalized display name
   'kind': 'ligand|gpcr|rtk|ion_channel|g_protein|enzyme|kinase|second_messenger|
            transcription_factor|reactant|catalyst|intermediate|product|
            transition_state|other',
   'compartment': 'extracellular|membrane|cytosol|nucleus|solution|surface|gas_phase'
 }],
 'interactions': [{
   'id': string,
   'from': string,                   // entity id
   'to': string,                     // entity id
   'type': 'activates|inhibits|produces|binds|phosphorylates|forms_bond|breaks_bond|
            transfers_electron|catalyzes',
   'sign': '+'|'-'|'0',
   'order': int,                     // position in the cascade, 1..N, ties allowed
   'quote': string,                  // verbatim minimal span from the passage
   'passageId': '{{id}}'
 }]
}
Rules:
- No entity and no interaction without a supporting verbatim quote from THIS passage.
  Never infer an edge from general biology knowledge not stated in the passage.
- Sign is '+' or '-' only if the passage uses an explicit activate/inhibit/increase/
  decrease verb for that step; otherwise '0' and note it is non-directional.
- A second messenger entity must have at least one producer interaction and one consumer
  interaction in THIS passage's extraction, or it is still returned but will be flagged
  'orphan' by the coherence judge (P18) — do not fabricate the missing side.
- Entities must stay inside the given scope's compartments; if the passage places an
  entity in a compartment inconsistent with its kind (e.g. a GPCR in the nucleus), return
  it as stated and let the coherence judge flag it — do not silently correct it.
- If the passage does not support any interaction for this scope, return
  {'entities': [], 'interactions': []}. Abstaining per source is correct; other sources
  may still contribute.
- Never complete a dose, affinity constant or kinetic parameter not in the passage.
```

## Notes

- Output per source is merged in code into one `MechanismGraph` (dedupe entities by id,
  keep every interaction with its own quote/passageId — do not merge interactions across
  sources even if they describe the same step).
- Validate with the `MechanismGraph` zod schema fragment (module 08 contracts) before
  merge; each interaction becomes a `Claim` with `basis='background'`,
  `actionType='mechanism'` (SPEC §8 v0.3).
- Feeds the deterministic validators in `src/modules/08-mechanism/validators/` (quote check,
  cross-reference resolution, structural checks) before `coherence-judge` (P18) runs.
