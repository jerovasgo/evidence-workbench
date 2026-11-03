# AGENTS.md — Genebark contributor guide

This file applies to every coding agent and human contributor. It is intentionally vendor-neutral. Read it before changing the repository, then consult the relevant module document under `docs/architecture/`.

## Product

Genebark is a domain-specific agent harness for evidence-grounded genetics research. It retrieves scientific literature, extracts atomic findings, verifies each finding against its source text, compares experimental context and renders the result as a concise answer plus an appropriate visual representation.

It is not a general chatbot, a clinical decision tool or a medical-advice product. Queries may concern disease genetics as scientific research, but the system must not diagnose, prescribe or instruct a person about their care.

## Architecture

- Next.js App Router, React, strict TypeScript, Tailwind CSS and Motion.
- Supabase/Postgres for run state, resumable stage outputs and audit records.
- Meta Model API (`muse-spark-1.3`) through `src/shared/meta/client.ts`.
- A deterministic orchestrator coordinates bounded model calls. Agents never roam freely and never bypass schemas, budgets or tool allow-lists.
- SSE streams real stage events and progressive results to the client.
- React Flow/ELK render evidence maps, algorithms and mechanisms; layout is code, not model-generated coordinates.

## Non-negotiable evidence contract

1. Model output is a proposal. Code validates identifiers, schemas, quotes, numbers, retraction signals, scope and support before a claim becomes verified.
2. Every displayed verified claim retains a source, passage locator and verbatim quote. Partial support remains visibly qualified.
3. A provisional overview may use retrieved abstracts and must be labelled as such. The definitive overview uses verified findings and is immutable once published.
4. Never manufacture opposition between studies. Concordance and contradiction emerge from findings plus experimental context.
5. No secrets, personal data, full copyrighted papers or plaintext query content in logs. Log identifiers, timings, counts, hashes and costs only.
6. Model calls go through `runAgent`, use Zod structured output, bounded time/cost and the shared prompt preamble.
7. Prefer deterministic code for routing, ranking, validation, state transitions and rendering. Use a model where semantic synthesis is genuinely required.
8. Keep the UI progressive: immediate contextual acknowledgement, provisional answer, verified answer, then visual and methodological depth without blocking the chat.

## Source scoring

The source score is code-computed and explainable:

`relevance × evidence level × quality × currency × applicability`

Relevance is deterministic lexical/intent fit using the query, subquestions, title and available snippet. Named genes, proteins and variants receive extra weight. Evidence level comes from study/publication type; quality uses explicit metadata; currency uses publication year; applicability compares experimental context. Do not replace these factors with an opaque global LLM score.

## Repository map

- `src/modules/01-orchestrator/` — routing, run lifecycle, streaming and memory.
- `src/modules/02-retrieval/` — search planning, PubMed/Europe PMC/web retrieval.
- `src/modules/03-extraction-verification/` — passages, extraction and verification.
- `src/modules/04-grading-scoring/` — grades and explainable source scoring.
- `src/modules/05-governance/` — concordance and contradiction relations.
- `src/modules/06-algorithm/`, `07-map-matrix/`, `08-mechanism/` — visuals.
- `src/modules/12-evaluation/` and `evals/genetics/` — reproducible evaluations.
- `prompts/` — versioned runtime prompt specifications.
- `docs/DECISIONS.md` — historical decision log; history is not current product documentation unless a newer entry says so.

## Definition of done

- Relevant unit and integration tests pass.
- `pnpm lint`, `pnpm typecheck` and the production build pass.
- No module-boundary violation or secret is introduced.
- User-facing claims match the implementation; unfinished behavior is labelled.
- Material architecture or behavior changes update the relevant documentation.

<!-- BEGIN:nextjs-agent-rules -->

## Next.js version note

This project may use framework APIs newer than an agent's training data. Consult the installed documentation in `node_modules/next/dist/docs/` before changing framework conventions and follow its deprecation notices.

<!-- END:nextjs-agent-rules -->
