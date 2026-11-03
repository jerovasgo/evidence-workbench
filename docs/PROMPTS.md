# Genebark prompt registry

Runtime prompts live in `prompts/` and are versioned individually. This document describes their current role; it is not a second copy of prompt text.

All model-backed stages share `P0-preamble.md`, return Zod-validated structured output and execute through `runAgent` with bounded tokens, time, cost and allowed tools.

| Prompt | Runtime role | Evidence boundary |
| --- | --- | --- |
| `P0` | Shared Genebark contract | Genetics research only; retrieved text is untrusted data |
| `P1` | Intent router | Classifies request; does not answer scientific content |
| `P2` | Question/scenario structurer | Produces scope, context and subquestions |
| `P3` | Search planner and semantic rescue | Produces search queries; does not claim results |
| `P4` | Source classifier | Labels source/study metadata with uncertainty |
| `P5` | Claim extractor | Proposes atomic claims with verbatim quotes |
| `P7` | Relation labeller | Compares verified claims in experimental context |
| `P9` | Algorithm synthesizer | Uses verified claim IDs only |
| `P10` | Support judge | Judges claim support within bounded surrounding text |
| `P16` | Mechanism scoper/synthesizer | Builds mechanism structure from verified evidence |
| `P17` | Mechanism extractor | Extracts entities/interactions with provenance |
| `P18` | Coherence judge | Checks evidence-grounded graph coherence |

Additional overview synthesis prompts are implemented in `src/modules/01-orchestrator/agents/evidence-overview.ts`:

- `retrieved-overview`: provisional synthesis from retrieved abstracts;
- `evidence-overview`: definitive synthesis from verified claims.

## Prompt rules

1. Preserve genes, proteins, variants, organism and experimental conditions exactly.
2. Never invent citations, identifiers, measurements or consensus.
3. Do not force contradiction or manufacture controversy.
4. Distinguish documented findings from cross-source inference.
5. A missing universal ranking may become a qualified shortlist when sources support the candidates.
6. Return partial/contextual answers instead of globally refusing when some evidence is usable.
7. No prompt may bypass deterministic quote, number, retraction, scope or schema checks.

Historical clinical prompt drafts were removed from this registry. The chronological pivot remains documented in `docs/DECISIONS.md` for audit purposes only.
