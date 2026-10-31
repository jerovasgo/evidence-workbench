# General query expansion and retrieval rescue — 2026-10-31

## Objective

Replace the hypertension-specific retrieval branch with a query-independent mechanism. The system must preserve a fast deterministic first pass, recognize when that pass is not good enough, and reformulate only when needed. A rescue augments the original evidence pool; it never silently replaces it or turns title matching into a scientific exclusion decision.

## Implemented flow

1. Detect the request shape in deterministic code: `ranking`, `association`, `comparison`, `mechanism`, `recency` or `general`.
2. Start PubMed and Europe PMC retrieval immediately. Add bounded intent facets: association/replication/synthesis for ranking and association; functional/pathway evidence for mechanisms; comparable/synthesis evidence for comparisons; update/review evidence for recency.
3. Deduplicate and score the initial titles. Classify retrieval as `empty`, `off_topic`, `thin` or `sufficient`, recording candidate count, relevant count, family diversity and a human-readable reason.
4. For every state except `sufficient`, call the existing search planner once. Its prompt requires standard literature terminology, translation where appropriate, preserved identifiers and complementary—not cosmetic—queries.
5. Execute rescue queries through the same bounded connectors and URL controls, merge them with the initial candidates, deduplicate again and rerank.
6. Persist `retrieval_rescue` with the trigger, initial queries, rescue queries, counts and failure reasons. `source_selection` records the final ordering under `title-priority@2`.
7. Do not publish an early overview from a clearly off-topic pool. Thin but relevant evidence may still produce a provisional overview while rescue continues; rescued sources are subsequently streamed into the same run.

Specific terminology normalizations may remain as cheap accelerators, but no topic-specific branch decides whether rescue exists or how it runs.

## Validation

Unit tests cover all six query shapes, all four sufficiency states, general association expansion, source retention and a non-medical rescue case for drought-tolerance genes in rice. That pipeline test starts with one thin source, executes a semantic rescue, merges both passes and verifies the persisted audit.

Live retrieval validation (`evals/genetics/retrieval-rescue-live.json`):

- `What genes are most associated with drought tolerance in rice?` — 36 deduplicated candidates across PubMed and Europe PMC; 35 passed the fast relevance screen; `sufficient` without model rescue in 1.137 s.
- `¿Qué mecanismos relacionan la autofagia con el envejecimiento muscular?` — initial state `empty`; the planner translated and decomposed the topic into autophagy, mitophagy, mitochondrial quality control, sarcopenia and regulatory pathways; 69 rescued candidates, 15 passing the fast relevance screen; final state `sufficient` in 5.062 s.

These are retrieval observations, not proof that every candidate is scientifically correct or that downstream claim verification will retain it. Title relevance initiates deeper review; it does not substitute for abstract/full-text extraction, quotation checks, support judgment or retraction checks.
