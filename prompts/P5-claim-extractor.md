# P5 — Claim extractor

Version: `P5@0.4`
Agent: `claim-extractor` (module 03, tier T1, 1 step, ~3,000 output tokens, 25 s timeout)
Shares the common preamble `P0`.

**2026-10-29 pivot (docs/DECISIONS.md), heaviest rewrite in the prompt set:**
`actionType` (the clinical workflow verbs assess/test/treat/threshold/
disposition/avoid) -> a general-science claim taxonomy
(finding/method/measurement/theory/mechanism/limitation); `basis`
(`recommendation`/`background`) -> (`primary`/`background`); `safetyCritical`'s
description moves from clinical hazards (dose, contraindication, discharge
criteria, anticoagulation) to lab/chemical/biological/physical hazards
(explosive, toxic, corrosive, biohazard, pathogenic, radioactive, lethal —
`src/modules/03-extraction-verification/validators/safety-critical.ts`'s own
keyword list); "clinician-addressed" -> "reader-addressed".

**Adapted from the `docs/PROMPTS.md` §10 draft:** that draft calls the model once per
*(passage, sub-question)* pair. Module 03
(`docs/architecture/03-claim-extraction-and-verification.md`) is authoritative and
batches differently — "one `Source` + its relevant `Passage[]` ... + the
sub-questions. One call per source, run in parallel." — so this version sends every
windowed passage and every sub-question for one source in a single call, per module
03, not the older per-pair draft.

## Task

```text
Task: Extract scientific claims this source explicitly states, relevant to these
sub-questions. Do not add content the passages don't state; do not answer a
question the source doesn't address.
<source_title>{{source_title}}</source_title>
<sub_questions>{{sub_questions}}</sub_questions>
<passages>{{passages}}</passages>
Return: {
 'claims': [{
   'text': string,              // reader-addressed paraphrase, <=35 words, no added content
   'basis': 'primary'|'background',
   'actionType': 'finding'|'method'|'measurement'|'theory'|'mechanism'|'limitation',
   'conditions': [{'variable','op','value','unit'}]|[],
   'geneticContext': { 'gene': string|null, 'organism': string|null, 'model': string|null,
     'perturbation': string|null, 'measurement': string|null, 'effect': string|null }|null,
   'quote': string,             // verbatim from ONE passage, minimal span, <=300 chars
   'passageId': string,         // must exactly match a passageId given in <passages>
   'nativeGrade': string|omit,  // copy exactly as written, e.g. 'a well-established result'
   'safetyCritical': bool       // explosive, toxic, corrosive, biohazard, pathogenic, radioactive, lethal, etc.
 }]
}
Rules:
- One claim = one finding/result; never merge content across passages.
- For genetics, geneticContext values must be exact contiguous excerpts of the quote; use null for missing values. Preserve experimental context explicitly stated in the cited passage:
  gene or molecular entity, organism, cell or model, perturbation, measurement and
  direction of effect where available. Record context in the claim text or conditions;
  never infer missing species, causal direction, or generalize across models.
- If the supplied passage lacks context needed to support a specific statement,
  narrow the claim to what the passage actually says or omit it.
- 'quote' must be copied character-for-character from the passage text given for
  that 'passageId' — never paraphrase or summarize inside 'quote'; 'text' may paraphrase.
- Never state a measurement, threshold, or number in 'text'/'conditions' that is not
  present in 'quote'.
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
