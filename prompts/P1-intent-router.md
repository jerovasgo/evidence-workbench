# P1 — Intent router

Version: `P1@0.1`
Agent: `router` (module 01, tier T0, 1 step, 300 output tokens, 4 s timeout)
Shares the common preamble `P0`.

**Adapted from the `docs/PROMPTS.md` §10 draft:** that draft used
`primary_intent/secondary_intent` with the set
`algorithm|fact_lookup|explainer|comparison|out_of_scope` and an
`asks_for_patient_instructions` flag. Module 01 (`docs/architecture/01-orchestrator-and-routing.md`)
is authoritative and uses a different, wider intent set and a flat `reject` object
instead — this version follows module 01, not the older draft (per `00-overview.md`:
"the architecture files and docs/DAY0-VERIFICATION.md win; adapt the prompt text and
bump its version").

## Task

```text
Task: Classify the clinician's request. Do not answer it.
<request>{{free_text}}</request>
Return: {
 'intent': 'algorithm'|'evidence_map'|'mechanism'|'fact_lookup'|'comparison'|'watch'|'out_of_scope',
 'secondary': same options or omit entirely if there is none,
 'condition': string|omit,          // the clinical condition/topic, if stated
 'setting': string|omit,            // e.g. 'emergency', 'primary_care', if stated
 'confidence': 'high'|'medium'|'low',
 'reject': { 'reason': string }|omit  // only when intent = 'out_of_scope'
}
Rules:
- A request naming a specific patient, carrying identifiers, or asking for
  individual dosing/management advice for a named patient is 'out_of_scope' with a
  'reject.reason' explaining why — note that a code pre-filter already runs before
  you see this request (module 01), so most such requests never reach you; still
  classify as 'out_of_scope' if one slips through.
- If the request mixes intents, 'intent' is the one that answers the literal
  question; 'secondary' is the other one, omitted if there is only one.
- If confidence is 'low', still return your best guess for 'intent' — the
  orchestrator (not you) decides whether to ask the clinician a clarifying question
  instead of proceeding. Do not fabricate a clarifying question yourself.
- Never guess 'condition' or 'setting' if the request does not state or clearly
  imply them; omit the field instead.
```

## Notes

- Input is capped at 1,500 characters by the orchestrator before it reaches this
  prompt (module 01).
- Output validated against `RouterOutputSchema` (`src/lib/schemas/router.ts`); on
  invalid output, one repair retry (runAgent harness), then the request fails with
  reason `invalid` and the route handler returns a 502 rather than guessing a route.
- The identifier pre-filter (`src/lib/validators/identifiers.ts`) runs in code
  **before** this prompt is ever sent — this prompt is the second line of defence
  module 01 describes, not the first.
