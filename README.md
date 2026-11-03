# Genebark

![Genebark](public/brand/genebark-lockup-white.png)

**An agent harness for evidence-grounded genetics research.**

[Live demo](https://evidence-workbench-xi.vercel.app) · [Architecture](docs/architecture/00-overview.md) · [Evaluation evidence](evals/genetics/) · [Security](SECURITY.md)

Genebark turns an open-ended genetics question into a concise, traceable answer and an appropriate scientific visualization. It retrieves literature, reads the relevant sections, extracts atomic findings, checks those findings against verbatim source text, compares experimental context and progressively renders the result while research continues.

It is designed for researchers, laboratory teams and technically trained students who need to understand what the evidence actually supports without manually reconciling dozens of papers. Genebark is a research tool—not a clinical decision system and not medical advice.

## Why it is different

A conventional chatbot usually retrieves passages and writes an answer. Genebark provides a controlled execution environment around the model:

- **Progressive research:** an immediate contextual acknowledgement is followed by an explicitly provisional abstract-grounded overview, then an immutable synthesis grounded in verified findings.
- **Evidence verification:** claims retain their source, locator and verbatim quote; deterministic checks validate existence, quotation, numbers, retraction signals and scope before verification.
- **Context-aware comparison:** agreement or contradiction is assessed only after considering organism, model, intervention, assay and experimental conditions.
- **Intent-driven visuals:** the same evidence can become an evidence map, comparison matrix, mechanism diagram or decision algorithm instead of a wall of text.
- **Transparent ranking:** every source receives an explainable score based on deterministic relevance, evidence level, explicit quality signals, currency and applicability.
- **Temporary conversational memory:** follow-up questions can refer to earlier genes, studies and findings inside the active anonymous chat without permanent conversation storage.

## How Meta powers Genebark

Genebark uses **Muse Spark 1.3 through the Meta Model API** for the semantic work that deterministic code cannot reliably perform:

- structuring complex genetics questions;
- reformulating thin or ambiguous literature searches;
- extracting atomic findings from scientific passages;
- judging semantic support and experimental scope;
- synthesizing provisional and verified overviews;
- labelling cross-study concordance and contradiction;
- transforming verified evidence into mechanism and algorithm structures.

Every call is bounded by a Zod output schema, timeout, token/cost budget and tool allow-list. The model proposes structured interpretations; code controls execution and verifies the evidence. Removing the model would remove the semantic bridge between heterogeneous scientific language. Removing the deterministic harness would remove the traceability and reliability that distinguish Genebark from a chatbot.

## Progressive execution

```text
User question
   │
   ├─ deterministic intent + search seeds ───────────────┐
   │                                                     │
   ├─ trusted-index retrieval (PubMed / Europe PMC) ─────┤
   │       └─ provisional abstract-grounded overview     │
   │                                                     ▼
   └─ structure → selective full text → section ranking → extraction
                                                        │
                         deterministic verification ◀───┘
                                                        │
             source score → synthesis → relations → visualization
```

SSE events update the interface as real stages finish. Complex work runs concurrently where dependencies allow it; the UI never fabricates activity or exposes private chain-of-thought.

## Evidence contract

A verified claim must satisfy the checks that apply to its source and content:

1. the source identifier resolves;
2. the cited passage exists;
3. the quote is present verbatim or within the bounded OCR tolerance;
4. measurements and numbers are preserved;
5. no known retraction/withdrawal signal invalidates the source;
6. the claim is semantically supported within its surrounding context;
7. scope limitations are retained rather than generalized away.

Partially supported findings remain qualified. Failed findings are withdrawn and recorded in the audit metadata.

## Source score

Genebark computes, rather than asks a model for, the source score:

```text
relevance × evidence level × quality × currency × applicability
```

- **Relevance:** weighted overlap between the query/subquestions and title/snippet; named genes, proteins and variants receive extra weight, with small intent-specific signals for association, mechanism and comparison questions.
- **Evidence level:** publication/study type.
- **Quality:** explicit methods and conflict-of-interest metadata when available; unknown metadata is not silently treated as negative.
- **Currency:** publication age with a bounded floor; an explicit supersession signal can be handled separately once direction is unambiguous.
- **Applicability:** match between requested and reported experimental context.

The Evidence & Sources drawer exposes the factors and the relevance rationale.

## Research modes

- **Quick:** short exploration window and fast synthesis.
- **Balanced:** default depth for most genetics questions.
- **Deep:** longer exploration window for broader recovery and comparison.

Depth controls time and work attempted, not a promise to review a fixed number of papers.

## Technology

- Next.js 16, React 19 and strict TypeScript
- Meta Model API (`muse-spark-1.3`)
- Supabase/Postgres with Row-Level Security
- PubMed, Europe PMC, Crossref, NCBI Gene, HGNC, Ensembl and UniProt
- React Flow, ELK and SVG scientific visualizations
- SSE progressive streaming
- Vitest, ESLint and module-boundary validation

## Run locally

### Requirements

- Node.js 20+
- pnpm (`corepack enable`)
- Docker and the Supabase CLI, or an existing Supabase project
- Meta Model API credentials

```bash
pnpm install
npx supabase start
cp .env.example .env.local
pnpm dev
```

Open `http://localhost:3000`.

Required environment variables are documented in `.env.example`. Generate the 32-byte encryption key with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Apply migrations to a linked cloud project with `npx supabase db push`.

## Validation

```bash
pnpm test
pnpm lint
pnpm typecheck
pnpm build
```

Live-model evaluations are opt-in because they consume external APIs. Reproducible fixtures and recorded results live under `evals/genetics/`.

## Current scope

- No authentication or permanent chat history; active-chat memory expires with the anonymous session.
- Scientific research only. Genebark does not diagnose, prescribe or provide patient-specific advice.
- Open/full-text availability varies by source; the source registry distinguishes reviewed, unavailable, excluded and pending material.
- This is a hackathon research prototype, not a systematic review or regulatory/compliance certification.

## Repository map

- `src/modules/01-orchestrator/` — run lifecycle and progressive orchestration
- `src/modules/02-retrieval/` — retrieval and source curation
- `src/modules/03-extraction-verification/` — evidence extraction and verification
- `src/modules/04-grading-scoring/` — grading and source scoring
- `src/modules/05-governance/` — concordance and contradiction
- `src/modules/06-algorithm/`, `07-map-matrix/`, `08-mechanism/` — scientific visuals
- `src/modules/12-evaluation/` and `evals/genetics/` — evaluation harness
- `prompts/` — versioned runtime prompt specifications
- `docs/DECISIONS.md` — chronological engineering record

## License

Released under the [MIT License](LICENSE).
