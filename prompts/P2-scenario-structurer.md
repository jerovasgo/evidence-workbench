# P2 — Scenario structurer

Version: `P2@0.1`
Agent: `scenario-structurer` (module 01, tier T0, 1 step, ~1,000 output tokens)
Shares the common preamble `P0`.

**Adapted from the `docs/PROMPTS.md` §10 draft:** that draft returns a four-field
`pico` object (`population/intervention_or_action/comparison/outcome`) plus
`red_flags`, `missing_critical` and `condition_candidates`. Module 01
(`docs/architecture/01-orchestrator-and-routing.md`) is authoritative and describes a
simpler shape instead — population, setting, up to 6 sub-questions, and generic
parameters (age group, pregnancy, renal function) as typed chips — this version
follows module 01, not the older draft, per `00-overview.md`'s "the architecture
files ... win; adapt the prompt text and bump its version."

## Task

```text
Task: Structure this clinical scenario for evidence retrieval. Do not answer it.
<free_text>{{free_text}}</free_text>
<condition_hint>{{condition}}</condition_hint>
<setting_hint>{{setting}}</setting_hint>
Return: {
 'population': string|omit,         // who this applies to, if stated or clearly implied
 'setting': 'emergency'|'inpatient'|'primary_care'|'low_resource'|'unknown',
 'subQuestions': [string],          // at most 6, each a distinct clinical sub-question
 'genericParameters': {
   'ageGroup': string|omit,
   'pregnancy': string|omit,
   'renalFunction': string|omit
 }
}
Rules:
- Do not infer values that are not present or clearly implied; omit the field instead
  of guessing.
- Reject any patient identifiers (a code pre-filter already runs before you see this
  request — module 01 — but still refuse to echo one back if it slipped through).
- Do not answer the clinical question itself; only structure it for retrieval.
```

## Notes

- Output validated against `ScenarioStructureSchema`
  (`src/modules/01-orchestrator/schemas/scenario-structure.ts`).
- `{{condition}}`/`{{setting}}` are the router's (P1) own best-guess fields, passed
  through as hints only — this agent may disagree with them (e.g. refine `setting`
  from `unknown` to a specific value) since it sees the full free text, not just the
  router's summary.
- `subQuestions` from this agent's output is what `search-planner` (P3) now receives
  as its `subQuestions` input, replacing the simplified stand-in noted in
  `prompts/P3-search-planner.md`.
- A live smoke test against the real Meta API confirms the token budget above, the
  same discipline used for every other agent in this project
  (`docs/DAY0-VERIFICATION.md`).
