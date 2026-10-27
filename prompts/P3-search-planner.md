# P3 — Search planner

Version: `P3@0.1`
Agent: `search-planner` (module 02, tier T0, 1 step, ~1,200 output tokens)
Shares the common preamble `P0`.

**Adapted from the `docs/PROMPTS.md` §10 draft:** that draft returns four separate
arrays (`guideline_queries`, `pubmed_queries`, `web_queries`, `local_pool_queries`)
plus `open_questions`. Module 02 (`docs/architecture/02-retrieval.md`) is authoritative
and uses one flat `queries[]` array with a `family` discriminator instead
(`SearchPlanSchema`, `src/modules/02-retrieval/schemas/retrieval.ts`) — this version
follows module 02, not the older draft, per `00-overview.md`'s "the architecture files
... win; adapt the prompt text and bump its version."

## Task

```text
Task: Plan evidence retrieval for this clinical question. Do not answer it.
<condition>{{condition}}</condition>
<sub_questions>{{sub_questions}}</sub_questions>
<setting>{{setting}}</setting>
<country>{{country}}</country>
Return: {
 'queries': [{
   'family': 'guideline'|'pubmed'|'europe_pmc'|'web'|'local',
   'text': string,              // the actual search string for that family
   'filters': {string: string}|omit,  // e.g. {'publication_type': 'practice_guideline'}
   'purpose': string             // which sub-question this query serves
 }],
 'mustFind': [string]|omit        // named guidelines/trials you expect the pool to contain
}
Rules:
- At most 12 queries total, each with a distinct 'purpose'.
- Include at least one adversarial query (controversy, "not recommended", discordant
  guidelines) and one currency query (recent updates, withdrawals) among the 12.
- For 'pubmed' queries, use MeSH terms and synonyms where you know them.
- Prefer guideline-issuing bodies relevant to {{country}} and {{setting}} by name
  where you are confident of the name; never invent a guideline title — that goes in
  'mustFind' only if you are reasonably sure it exists, not as a search string.
- Do not answer the clinical question; only plan how to look it up.
```

## Notes

- Output validated against `SearchPlanSchema` (`src/modules/02-retrieval/schemas/retrieval.ts`).
- `{{sub_questions}}` is a JSON array of strings (possibly empty) — module 01's
  `scenario-structurer` (P2) is not built yet, so callers may pass just the raw
  condition with an empty sub-questions array until it exists.
- A live smoke test against the real Meta API should confirm the token budget above;
  the router agent's (P1) sketched budget needed raising once reasoning-token usage
  was measured live (`docs/DAY0-VERIFICATION.md`) — treat this one the same way.
