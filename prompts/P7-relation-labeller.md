# P7 — Relation labeller

Version: `P7@0.1`
Agent: `relation-labeller` (module 05, tier T1, batched ≤10 pairs/call)
Shares the common preamble `P0`.

**Adapted from the `docs/PROMPTS.md` §7 draft:** that draft judges one pair per
call and returns `{same_question, relation, difference, newer_source,
adaptation_justified_by_source, evidence}`, with `relation` including
`'unrelated'`. `docs/architecture/05-governance-local-vs-external.md` is
authoritative and is simpler and batched — pairs are pre-filtered by code
(`pairClaimsForRelations`) so every pair given to the model is already about
the same question; output per pair is just `kind ∈ agrees|differs|supersedes|
contradicts|adapts` plus `evidence` and a short `note`, and an unclear pair is
omitted rather than labelled `'unrelated'`. This version follows the
architecture doc, not the older draft, per `00-overview.md`'s "the
architecture files win; adapt the prompt text and bump its version." `kind`
and `evidence` map directly onto `shared/domain/relation.ts`'s `Relation`
type; `note` is folded into `evidence` (one string) rather than kept separate,
since `Relation` has no third field.

## Task

```text
Task: For each pair below, decide how claim A relates to claim B. Both claims
are about the same clinical question and come from different sources — judge
only from the two quotes given; never use outside knowledge of the topic.
<pairs>{{pairs_json}}</pairs>
Each item is { 'pairId': number, 'claim_a': string, 'quote_a': string, 'claim_b': string, 'quote_b': string }.
Return: { 'relations': [{ 'pairId': number, 'kind': 'agrees'|'differs'|'supersedes'|'contradicts'|'adapts', 'evidence': string }] }
Rules:
- Label only from the two quotes above — do not infer anything they do not say.
- 'agrees': same action, same scope, same strength.
- 'differs': same action, scope or strength diverges (population, threshold, timing).
- 'adapts': B narrows or specializes A's scope in a way the quotes support.
- 'supersedes': one quote explicitly updates or replaces the other (e.g. states a
  newer recommendation for the same question).
- 'contradicts': ONLY when both quotes address the same population and action and
  give opposite directions (e.g. "should" vs "should not"). Prefer 'differs' or
  'adapts' over 'contradicts' whenever the scope differs at all.
- If the relation is unclear or the quotes do not actually address the same
  question, OMIT that pairId from 'relations' entirely — never guess.
- 'evidence' is one short sentence citing what each quote actually says.
Do not decide which claim the clinician should follow.
```

## Notes

- Output validated against `LabelRelationsOutputSchema`
  (`src/modules/05-governance/schemas/relation-labeller.ts`).
- Pairing is code's job, not the model's: `pairClaimsForRelations`
  (`src/modules/05-governance/pipeline/pair-claims.ts`) deterministically
  selects candidate cross-source pairs (same `actionType`, compatible
  `conditions`, different `sourceId`) before any model call. The architecture
  doc's full heuristic also matches on "semantic key from sub-question
  assignment" — not buildable yet, since claims don't carry which sub-question
  they answer (logged as a known gap, `SECURITY.md`/`docs/DECISIONS.md`).
- `pairId` is an opaque batch-local index assigned by code, never a claim id —
  the agent (`src/modules/05-governance/agents/relation-labeller.ts`) looks up
  the real claim ids for `from`/`to` from the original pair list by `pairId`
  after validation, so the model can never cause a hallucinated id to reach
  `Relation` data.
- Runs strictly after the SSE `done` event for the Evidence view has already
  been sent — never on the user-visible critical path, per the 2026-10-28
  TTFT-preservation decision (`docs/DECISIONS.md`). Batched (≤10 pairs/call,
  the architecture doc's own limit) with bounded concurrency, mirroring
  `classifySourcesBatched`'s pooling pattern from the latency audit.
