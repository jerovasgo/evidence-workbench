# P16 — Mechanism synthesizer

Version: `P16@0.1`
Agent: `mechanism-synthesizer` (module 08, tier T2, 1 step + 1 manual invariant-repair
step — see Notes, ~6,000 output tokens, 30 s timeout)
Shares the common preamble `P0`.

**Collapses the architecture doc's 3-agent pipeline into one call** (2026-10-31,
docs/DECISIONS.md), the same move P9 made for module 06: `docs/architecture/
08-mechanism-diagrams.md` specifies `mechanism-scoper` (P16, narrows to one
pathway) → `mechanism-extractor` (P17, extracts entities/interactions from raw
passages) → `coherence-judge` (P18, a second pass that can only remove edges or
flag warnings). V1 does the scoping and extraction in one call, over claims the
main pipeline has **already verified** (not raw passages — passage text isn't
retained after extraction, AGENTS.md rule 3; a verified claim's own `quote` field
already carries real, grounded source text). `coherence-judge` is deferred for
V1 — its job is covered here by strict anti-invention rules plus the same
invariant-repair-then-abstain safety net P9 uses (`validateMechanismGraph`,
`src/modules/08-mechanism/validators/mechanism.ts`). No cross-reference
resolution (UniProt/ChEBI/PubChem) or database corroboration
(Reactome/Rhea) in V1 either — confirmed with the user, logged as a real
deviation, not a silent gap.

**Framed for genetics as the primary domain** — gene regulation, CRISPR
mechanisms, signalling pathways affecting gene expression — with the schema's
existing parallel chemistry-reaction vocabulary (reactant/catalyst/intermediate/
product/transition_state) kept available for a chemistry-framed question.

## Task

```text
Task: Build a verified molecular/genetic mechanism graph from VERIFIED findings
only, for this mechanism question. Do not invent an entity or interaction that no
supplied claim's quote supports.
<scope>{{scope}}</scope>
<sub_questions>{{sub_questions}}</sub_questions>
<claims>{{claims_json}}</claims>
<!-- claims_json: [{ id, text, quote, sourceId }] -->
Return: {
 'scope': string,  // <=12 words, the single pathway/mechanism this diagram covers
 'entities': [{
   'id': string,
   'label': string,  // <=6 words
   'kind': 'ligand'|'receptor'|'channel'|'g_protein'|'enzyme'|'kinase'|'second_messenger'|'transcription_factor'|'reactant'|'catalyst'|'intermediate'|'product'|'transition_state'|'other',
   'compartment': 'extracellular'|'membrane'|'cytosol'|'nucleus'|'solution'|'surface'|'gas_phase'|omit
 }],
 'interactions': [{
   'id': string,
   'from': string, 'to': string,  // entity ids declared above
   'type': 'binds'|'activates'|'inhibits'|'phosphorylates'|'produces'|'degrades'|'opens'|'closes'|'translocates'|'forms_bond'|'breaks_bond'|'transfers_electron'|'catalyzes',
   'sign': '+'|'-'|'0',
   'order': number,  // position in the cascade, starting at 0
   'claimId': string  // id from <claims>, never invented, never retyped claim text
 }]
}
Rules:
- Narrow to ONE pathway or mechanism only (e.g. a single receptor-to-effector
  cascade, or one CRISPR-Cas9 cleavage mechanism). If the claims span more than
  one mechanism, cover only the one they most directly and completely ground;
  never half-cover two.
- Every interaction's `claimId` must be a real id from <claims>; never invent one.
- `sign`/`order`/`type` reflect only what the cited claim's quote actually
  states — never infer a sign or cascade position the quote doesn't support.
- Do not add an entity or interaction "for completeness" that no claim quote
  mentions — an incomplete but fully verified mechanism is correct; a complete
  but partly invented one is not.
- A `second_messenger` entity should have both a producer interaction (appearing
  as `to`) and a consumer interaction (appearing as `from`) when the evidence
  supports both; if only one side is supported, include only that side rather
  than inventing the other.
- Every entity must appear in at least one interaction — never list an entity
  with no role in the graph.
- At most 25 entities and 40 interactions. If the evidence naturally supports
  more, keep the most directly question-relevant chain and omit the rest rather
  than truncate mid-cascade.
```

## Notes

- Output validated against `MechanismGraphSchema`
  (`src/modules/08-mechanism/schemas/mechanism.ts`) — already flat
  (`entities[]`/`interactions[]` reference ids, no nesting), so no flatten/nest
  step is needed before sending it as structured output, unlike module 07's
  `MapNode`. `validateMechanismGraph`
  (`src/modules/08-mechanism/validators/mechanism.ts`) runs afterward.
  `runAgent`'s own repair retry only covers **schema shape**; a schema-valid
  graph that still fails an invariant (e.g. an interaction citing an unknown
  claim id, or an entity in no interaction) triggers exactly one **manual**
  repair call (`src/modules/08-mechanism/pipeline/synthesize-mechanism.ts`)
  with the specific violations appended to this same prompt as a
  `<violations>` block; if that second attempt still fails, the whole
  mechanism view abstains with the violation list shown, never a
  partially-wrong graph.
- `claimId` must be a real id from `<claims>` — `validateMechanismGraph`'s
  claim-id-in-pool check drops the whole graph to invalid (triggering the
  repair/abstain path above) if the model invents one; "model proposes, code
  verifies" applied to the synthesizer specifically, same as P9.
- V1's invariant set is deliberately minimal and favors showing a correct graph
  over abstaining on a technicality: claim-id-in-pool, referential integrity
  (every `from`/`to` exists), the entity/interaction budget above, and "every
  entity participates in ≥1 interaction." Second-messenger producer/consumer
  and compartment-consistency are asked for in the prompt above but **not**
  hard-enforced by the validator in V1 — encoding them safely needs the
  cross-reference data this version doesn't have, and a false abstain on an
  otherwise-correct mechanism is worse than a graph missing one soft check.
- A live smoke test against the real Meta API should confirm the token/timeout
  budget above, the same discipline used for every other agent in this project.
