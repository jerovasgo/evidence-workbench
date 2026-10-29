# P4 — Source classifier

Version: `P4@0.2`
Agent: `source-classifier` (module 02, tier T0, batched ≤40 items/call, parallel)
Shares the common preamble `P0`.

**2026-10-29 pivot (docs/DECISIONS.md):** `kind` enum generalized from a
clinical evidence hierarchy (guideline/rct/observational/local_protocol/
pathway_db) to a general-science one (meta_analysis/systematic_review/
controlled_experiment/observational_study/preprint/reference_work/
standards_body/dataset_or_database/local_protocol/other) — `meta_analysis`
and `preprint` are genuinely new tiers. `appliesTo.population` -> `scope`.

**Adapted from the `docs/PROMPTS.md` §10 draft:** that draft's `kind` enum includes a
`'non_scientific'` value; module 02 keeps `kind` within the canonical `SourceKind`
enum (`src/shared/domain/source.ts`) and adds a separate `isScientific` boolean
instead, plus a `confidence` field the draft didn't have. The draft is processed one
source at a time; module 02 batches up to 40 per call, so this version takes an array.

## Task

```text
Task: Classify each source and extract appraisal features. Do not score any of them.
<sources>{{sources_json}}</sources>
<!-- sources_json: [{ sourceId, title, metadataAndText (first ~1,500 chars) }] -->
For EACH source, return one object (same order as input, every sourceId present once):
{
 'sourceId': string,
 'kind': 'meta_analysis'|'systematic_review'|'controlled_experiment'|'observational_study'|'preprint'|'reference_work'|'standards_body'|'dataset_or_database'|'local_protocol'|'other',
 'isScientific': bool,          // false for blogs, forums, marketing pages
 'issuer': string|omit,
 'publicationYear': int|omit,
 'version': string|omit,
 'hasExplicitMethods': bool|omit,
 'nativeGradingSystem': string|omit,
 'declaresConflictsOfInterest': bool|omit,
 'appliesTo': {'country': string|omit, 'setting': string|omit, 'scope': string|omit}|omit,
 'supersedesOrSupersededBy': string|omit,
 'confidence': 'high'|'medium'|'low'
}
Return: { 'classifications': [ ...one object per source, same order... ] }
Rules:
- Use the field's absence (omit) when the text does not say; never guess a year,
  issuer, or grading system name.
- 'isScientific': false whenever the source reads as a blog, forum, consumer-facing
  marketing page, or news article, even if it mentions the topic by name.
- Base every field only on the given title/metadata/text — you are not told whether
  this came from PubMed, Europe PMC, or the web, and must not assume a kind from that.
```

## Notes

- Output validated against `ClassifySourcesOutputSchema` (`src/modules/02-retrieval/schemas/classification.ts`).
- **Code overrides the model when PubMed metadata is decisive** (module 02): when a
  source's PubMed `pubTypes` includes "Practice Guideline" (-> `standards_body`),
  "Systematic Review" (-> `systematic_review`), "Meta-Analysis" (-> `meta_analysis`),
  or "Randomized Controlled Trial" (-> `controlled_experiment`),
  `applyPubmedTypeOverride`
  (`src/modules/02-retrieval/classification/pubmed-type-override.ts`) forces `kind`
  to the matching value regardless of what the model returned — this is the
  "model proposes, code verifies" rule applied to classification specifically.
