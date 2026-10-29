# P3 — Search planner

Version: `P3@0.2`
Agent: `search-planner` (module 02, tier T0, 1 step, ~1,200 output tokens)
Shares the common preamble `P0`.

**2026-10-29 pivot (docs/DECISIONS.md):** "clinical question" -> "question";
`'guideline'` family -> `'standards_body'` (IUPAC/NIST/ISO-style publications);
MeSH-specific wording dropped for a field-general "standard terminology"
instruction, since MeSH (Medical Subject Headings) is biomedical-literature-
specific; `pubmed`/`europe_pmc`/`web`/`local` unchanged — both literature
databases index plenty of non-clinical biology/biochemistry.

**Adapted from the `docs/PROMPTS.md` §10 draft:** that draft returns four separate
arrays (`guideline_queries`, `pubmed_queries`, `web_queries`, `local_pool_queries`)
plus `open_questions`. Module 02 (`docs/architecture/02-retrieval.md`) is authoritative
and uses one flat `queries[]` array with a `family` discriminator instead
(`SearchPlanSchema`, `src/modules/02-retrieval/schemas/retrieval.ts`) — this version
follows module 02, not the older draft, per `00-overview.md`'s "the architecture files
... win; adapt the prompt text and bump its version."

## Task

```text
Task: Plan evidence retrieval for this question. Do not answer it.
<condition>{{condition}}</condition>
<sub_questions>{{sub_questions}}</sub_questions>
<setting>{{setting}}</setting>
<country>{{country}}</country>
Return: {
 'queries': [{
   'family': 'standards_body'|'pubmed'|'europe_pmc'|'web'|'local',
   'text': string,              // the actual search string for that family
   'filters': {string: string}|omit,  // e.g. {'publication_type': 'review'}
   'purpose': string             // which sub-question this query serves
 }],
 'mustFind': [string]|omit        // named standards/landmark studies you expect the pool to contain
}
Rules:
- At most 12 queries total, each with a distinct 'purpose'.
- Include at least one adversarial query (controversy, "disputed", conflicting
  findings) and one currency query (recent updates, retractions) among the 12.
- Use field-standard terminology and known synonyms for the topic where you know
  them.
- Prefer standards-issuing bodies (e.g. IUPAC, NIST, ISO) relevant to the topic by
  name where you are confident of the name; never invent a publication title —
  that goes in 'mustFind' only if you are reasonably sure it exists, not as a
  search string.
- Do not answer the question; only plan how to look it up.
```

## Notes

- Output validated against `SearchPlanSchema` (`src/modules/02-retrieval/schemas/retrieval.ts`).
- `{{sub_questions}}` is a JSON array of strings (possibly empty), normally the
  `subQuestions` field from module 01's `scenario-structurer` (P2) output
  (`prompts/P2-scenario-structurer.md`). A caller without a structured scenario yet
  (e.g. a unit test, or a precomputed/watch run that skips P2 per module 01) may
  still pass just the raw condition with an empty array.
- A live smoke test against the real Meta API should confirm the token budget above;
  the router agent's (P1) sketched budget needed raising once reasoning-token usage
  was measured live (`docs/DAY0-VERIFICATION.md`) — treat this one the same way.
