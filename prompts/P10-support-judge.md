# P10 — Support judge

Version: `P10@0.1`
Agent: `support-judge` (module 03, tier T2, 1 step, ~1,500 output tokens — see Notes)
Shares the common preamble `P0`.

**Adapted from the `docs/PROMPTS.md` §10 draft:** that draft returns
`{'verdict':'supports|partial|does_not_support|cannot_tell', 'mismatch': string|null}`.
Module 03 (`docs/architecture/03-claim-extraction-and-verification.md`) is
authoritative and uses a different shape — `support` (not `verdict`, and `'no'`/
`'unknown'` instead of `'does_not_support'`/`'cannot_tell'`), plus a structured
`issues` list instead of one free-text `mismatch` string — this version follows
module 03, not the older draft, per `00-overview.md`'s "the architecture files ...
win; adapt the prompt text and bump its version."

## Task

```text
Task: Judge whether the quote supports the claim. Be strict — judge only against
the text given below; never use outside knowledge of the topic.
<claim_text>{{claim_text}}</claim_text>
<claim_conditions>{{conditions_json}}</claim_conditions>
<quote>{{quote}}</quote>
<surrounding_context>{{surrounding_context}}</surrounding_context>
Return: {
 'support': 'supports'|'partial'|'no'|'unknown',
 'issues': ['negation'|'wrong_population'|'wrong_threshold'|'wrong_strength'|'out_of_context'|'other'],
 'note': string   // one short sentence explaining the verdict, especially for partial/no/unknown
}
Rules:
- 'supports' only if population, setting/comparator, and the recommended action in
  'claim_text' all match what the quote (read with its surrounding context) actually
  says — no scope drift.
- Watch specifically for: negation ("should not" vs "should"), population mismatch
  (e.g. claim says "adults", quote is about children), threshold/number mismatch,
  and strength mismatch ("may be considered" vs "recommended" / "should").
- If the quote and context are ambiguous or don't contain enough information to
  decide, return 'unknown' — never guess 'supports' to be helpful.
- 'no' means the quote actively contradicts or does not support the claim at all.
- 'issues' may be empty only when support is 'supports'.
```

## Notes

- Output validated against `JudgeSupportOutputSchema`
  (`src/modules/03-extraction-verification/schemas/support-judge.ts`).
- `{{surrounding_context}}` is computed by code
  (`src/modules/03-extraction-verification/pipeline/support-context.ts`), not the
  model — up to ±800 chars around the quote within its passage, normalized the same
  way the quote-match check (`findQuoteInPassage`) already does.
- This is the last verification step (step 8,
  `docs/architecture/03-claim-extraction-and-verification.md`): only this agent's
  `'supports'` result can ever make `verification.support` satisfy
  `VerifiedClaimSchema` (`shared/domain/claim.ts`). `'no'` drops the claim; `'partial'`
  keeps it with a visible caveat (`supportIssues`/`supportNote`); `'unknown'` (model's
  own verdict, or the judge call failing/timing out) also keeps the claim but leaves
  it out of any "verified" view — drawer-only, marked "not confirmed."
- Not batched across claims in this version (the architecture doc allows batching up
  to 8 "only if each is independently delimited") — one call per claim, run in
  parallel across a source's claims by the caller. Simpler and already fast enough at
  the claim volumes seen in live testing; batching is a later optimization if needed.
- Live-verified: module 03's sketched 400-token budget was far too small. T2 ('high'
  reasoning effort) alone consumed 600+ output tokens on reasoning before emitting
  any JSON, even for a short prompt — the same reasoning-token-budget surprise
  already found for the router (P1); raised to 1,500 here instead of rediscovering it.
