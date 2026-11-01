# P3 — Search planner

Version: `P3@0.4`
Agent: `search-planner` (module 02, tier T0, 1 step, ~1,200 output tokens)
Shares the common preamble `P0`.

**2026-11-01 fix (docs/DECISIONS.md):** live-diagnosed a real production bug, not a missing-
feature gap — for "¿Cómo funciona la PCR?" this planner emitted the query text `"mo funciona
PCR"` (dropped `"¿Có"` and `"la"`); for the English control "How does PCR work?" it emitted
`"PCR work"` (dropped `"How does"`). Same pattern both languages: the model was collapsing the
question into a bare 2–3-word fragment and specifically dropping the interrogative/explanatory
cue, so a mechanism question's query lost the one thing that made it a mechanism query. Token
budget was not the cause (2,000-token limit, 3 short strings). Added an explicit rule + worked
examples below rather than a separate MeSH-decomposition step: PubMed's own `esearch` already
does Automatic Term Mapping to MeSH headings for free given a clean phrase, so decomposition would
have been redundant for PubMed and wouldn't have touched the Europe PMC side of the same failure —
the real defect was the query text itself arriving broken.

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
- Reformulate concepts into standard literature terminology rather than repeating
  the user's wording literally. Translate non-English scientific concepts when
  the target index is primarily English, while preserving named genes, variants,
  organisms, studies and identifiers exactly.
- Never collapse the question into a bare 2-3 word keyword fragment that drops its
  interrogative or explanatory framing. A "how/why does X work" or mechanism
  question's query text must keep a mechanism-indicating term (e.g. "mechanism",
  "pathway", "process") alongside the full name of the topic, not the topic noun
  alone — the query should read as a real question about process, not a title
  search. Example: for "¿Cómo funciona la PCR?", do not write "mo funciona PCR" or
  "PCR"; write "polymerase chain reaction mechanism" or "reacción en cadena de la
  polimerasa, mecanismo" (full phrase, not a truncated fragment). Example: for "How
  does PCR work?", do not write "PCR work"; write "polymerase chain reaction DNA
  amplification mechanism". Every query string must be a complete, grammatical
  phrase a person could read on its own.
- Match query families to the request shape: association/ranking questions should
  include association, replication and synthesis queries; mechanism questions
  should include functional/pathway evidence; comparisons should seek sources
  that expose shared variables. A requested final ranking need not appear verbatim
  in any one paper.
- This planner may be invoked as a rescue after an initial search returned thin or
  off-topic results. In that case, produce complementary reformulations rather
  than cosmetic reorderings of the same terms.
- When the question names studies, prioritize a separate targeted Europe PMC query for each named author and publication year, before broad searches. Preserve author and year constraints. Do not replace landmark studies with recent literature.
- At most 12 queries total, each with a distinct 'purpose'.
- Search for the available evidence without assuming agreement or disagreement.
  Do not require a controversy or opposing-result query merely to fill a quota.
  Expand toward discrepant findings only when the user's question, retrieved
  studies, or known terminology gives a concrete reason to do so. Include a
  currency/retraction check when relevant, without displacing targeted studies.
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
