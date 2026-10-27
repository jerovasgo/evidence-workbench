# P5 — Claim extractor

Version: `P5@0.1`
Agent: `claim-extractor` (module 03, tier T1, 1 step, ~3,000 output tokens, 25 s timeout)
Shares the common preamble `P0`.

**Adapted from the `docs/PROMPTS.md` §10 draft:** that draft calls the model once per
*(passage, sub-question)* pair. Module 03
(`docs/architecture/03-claim-extraction-and-verification.md`) is authoritative and
batches differently — "one `Source` + its relevant `Passage[]` ... + the
sub-questions. One call per source, run in parallel." — so this version sends every
windowed passage and every sub-question for one source in a single call, per module
03, not the older per-pair draft.

## Task

```text
Task: Extract clinical management claims this source explicitly states, relevant to
these sub-questions. Do not add content the passages don't state; do not answer a
question the source doesn't address.
<source_title>{{source_title}}</source_title>
<sub_questions>{{sub_questions}}</sub_questions>
<passages>{{passages}}</passages>
Return: {
 'claims': [{
   'text': string,              // clinician-addressed paraphrase, <=35 words, no added content
   'basis': 'recommendation'|'background',
   'actionType': 'assess'|'test'|'treat'|'threshold'|'disposition'|'avoid'|'mechanism',
   'conditions': [{'variable','op','value','unit'}]|[],
   'quote': string,             // verbatim from ONE passage, minimal span, <=300 chars
   'passageId': string,         // must exactly match a passageId given in <passages>
   'nativeGrade': string|omit,  // copy exactly as written, e.g. 'Class I, LOE A'
   'safetyCritical': bool       // dose, contraindication, discharge criteria, anticoagulation, etc.
 }]
}
Rules:
- One claim = one recommendation/finding; never merge content across passages.
- 'quote' must be copied character-for-character from the passage text given for
  that 'passageId' — never paraphrase or summarize inside 'quote'; 'text' may paraphrase.
- Never state a dose, threshold, or number in 'text'/'conditions' that is not present
  in 'quote'.
- 'passageId' must be one of the ids given in <passages> — never invent one.
- If no passage answers any sub-question, return {'claims': []}. Do not force a claim.
```

## Notes

- Output validated against `ExtractClaimsOutputSchema`
  (`src/modules/03-extraction-verification/schemas/extraction.ts`).
- `<passages>` is a JSON array of `{passageId, locator, text}` — `passageId`/`text`
  come from `windowText` (`src/modules/03-extraction-verification/passages/window-text.ts`),
  a deterministic paragraph-based chunker, not the model.
- This agent's output is *proposed* claims only; `verify-claim.ts` is what actually
  decides whether each claim's quote is found, numbers match, the source isn't
  retracted, etc. (CLAUDE.md rule 5: "verified by code, not by the model"). `grade`
  and `verification` are not requested here — code fills `verification`, and module
  04 (grading, not built yet) will fill `grade`.
- A live smoke test against the real Meta API should confirm the token/timeout
  budget above, the same discipline used for every other agent in this project.
