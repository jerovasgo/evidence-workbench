# P2 — Scenario structurer

Version: `P2@0.2`
Agent: `scenario-structurer` (module 01, tier T0, 1 step, ~1,000 output tokens)
Shares the common preamble `P0`.

**2026-10-29 pivot (docs/DECISIONS.md):** generalized from a clinical PICO-like
shape to any scientific topic. `setting` (emergency/inpatient/primary_care/
low_resource) -> `context` (in_vitro/in_vivo/in_silico/theoretical/
field_study/industrial_or_applied) — the kind of evidence being sought, not a
care setting. `genericParameters` (ageGroup/pregnancy/renalFunction — clinical
patient covariates) -> `scopeParameters` (`system`: the organism/material/
reaction system under study; `conditions`: stated experimental/theoretical
conditions, e.g. "37C, pH 7.4" or "inert atmosphere") — still typed chips, not
a free-form bag, but no longer clinical-specific. `population` -> `scope`
(what the finding applies to).

**Adapted from the `docs/PROMPTS.md` §10 draft:** that draft returns a four-field
`pico` object plus `red_flags`, `missing_critical` and `condition_candidates`.
Module 01 (`docs/architecture/01-orchestrator-and-routing.md`) is authoritative
and describes a simpler shape — this version follows module 01, not the older
draft, per `00-overview.md`'s "the architecture files ... win; adapt the prompt
text and bump its version."

## Task

```text
Task: Structure this scientific question for evidence retrieval. Do not answer it.
<free_text>{{free_text}}</free_text>
<condition_hint>{{condition}}</condition_hint>
<setting_hint>{{setting}}</setting_hint>
Return: {
 'scope': string|omit,               // what the finding applies to (organism, material, system), if stated or clearly implied
 'context': 'in_vitro'|'in_vivo'|'in_silico'|'theoretical'|'field_study'|'industrial_or_applied'|'unknown',
 'subQuestions': [string],           // at most 6, each a distinct sub-question
 'scopeParameters': {
   'system': string|omit,            // the organism/material/reaction system under study
   'conditions': string|omit         // stated experimental/theoretical conditions
 }
}
Rules:
- For comparisons, produce shared scientific sub-questions that every study can answer. Do not create separate author-specific questions. Preserve named studies in scope.
- Do not infer values that are not present or clearly implied; omit the field instead
  of guessing.
- Reject any identifiers of a specific, real, identifiable person (a code
  pre-filter already runs before you see this request — module 01 — but still
  refuse to echo one back if it slipped through).
- Do not answer the scientific question itself; only structure it for retrieval.
```

## Notes

- Output validated against `ScenarioStructureSchema`
  (`src/modules/01-orchestrator/schemas/scenario-structure.ts`).
- `{{condition}}`/`{{setting}}` are the router's (P1) own best-guess fields, passed
  through as hints only — this agent may disagree with them (e.g. refine `context`
  from `unknown` to a specific value) since it sees the full free text, not just the
  router's summary.
- `subQuestions` from this agent's output is what `search-planner` (P3) now receives
  as its `subQuestions` input, replacing the simplified stand-in noted in
  `prompts/P3-search-planner.md`.
- A live smoke test against the real Meta API confirms the token budget above, the
  same discipline used for every other agent in this project
  (`docs/DAY0-VERIFICATION.md`).
