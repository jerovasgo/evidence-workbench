# Genebark security and privacy status

Genebark is a hackathon research prototype, not a compliance certification. This document describes controls that are implemented in the current repository and the limits that remain.

## Data posture

- The public experience is anonymous; there is no account or login system.
- Active conversational memory lives in the current browser tab and is bounded to a compact set of recent turns, findings and sources.
- A random anonymous session identifier isolates concurrent users.
- Refreshing/closing the tab, starting new research or session expiry discards client memory.
- The POST-to-SSE handoff uses an encrypted, expiring, single-use pending context record. It is deleted when consumed.
- Query text, source content and model prompts must not be written to application logs.

## Secrets

- `META_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY` and `APP_ENCRYPTION_KEY` are server-only environment variables.
- `.env*` is ignored except `.env.example`.
- The browser receives only the Supabase anonymous key where required.
- Encryption uses AES-256-GCM with a random nonce and record-bound authenticated data.

## Database

- Supabase Row-Level Security is enabled on application tables.
- Public evidence records are readable; private/session records are scoped by ownership or anonymous session identifiers.
- Budget and audit tables are not exposed to anonymous clients.
- Migrations under `supabase/migrations/` are the source of truth.
- `supabase/tests/0001_rls_cross_user.sql` exercises cross-user isolation; it requires a running Supabase/Postgres instance and is not part of the default unit test command.

## Model and tool boundaries

- All model calls pass through `runAgent` and the Meta Model API client.
- Calls have Zod output schemas, timeouts, token/cost limits and explicit tool allow-lists.
- Contributor model variants are rejected.
- Retrieved pages and papers are tagged as untrusted data; their instructions do not override the system contract.
- Web fetching requires HTTPS, a curated domain allow-list, redirect revalidation and response-size limits.
- Known limitation: the HTTP guard does not independently pin DNS resolution throughout a request, so production hardening should add egress controls or DNS/IP revalidation.

## Evidence integrity

- Source identifiers and locators are validated.
- Quotes must exist in the selected passage, with a bounded OCR tolerance.
- Numbers are checked for preservation.
- Retraction/withdrawal signals are checked when identifiers allow it.
- Semantic support is judged in surrounding context and then represented as supported, partial, unknown or rejected.
- A `VerificationReport` records the checks applied to each retained claim.
- Provisional abstract-based text is labelled; verified text is never silently downgraded or rewritten.

## Cost and availability controls

- Per-call, per-run and daily budget guards bound model spend.
- Research depth controls exploration time, concurrency and rescue attempts.
- PubMed/Europe PMC calls are rate-limited and time-bounded.
- Run cancellation propagates through retrieval, extraction and model calls where the underlying API supports abort signals.
- The in-memory cancellation registry and budget counters are appropriate for this single-instance demo; production multi-instance deployment would move them to shared durable state.

## Responsible scope

Genebark supports genetics research questions. It does not diagnose, prescribe, recommend treatment or process identifiable patient scenarios. Disease-associated genes may be discussed as scientific evidence, with uncertainty and experimental scope preserved.

## Reporting

For a security issue, open a private GitHub security advisory rather than a public issue. Do not include real credentials, personal data or unpublished source documents.
