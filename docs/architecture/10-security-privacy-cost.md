# 10 — Security, privacy, cost control

## Purpose
Keep sensitive material safe (uploaded protocols, watch definitions, user decisions), prevent abuse of a
public demo that spends a shared credit budget, and make "constant verification with agent-in-the-loop"
an enforced property of the system. This is a hackathon prototype: controls are real, but it is not a
compliance certification.

## Position
Cross-cutting. Implemented as middleware, database policies, and wrappers used by all modules.

## Data classification
| Class | Examples | Handling |
| --- | --- | --- |
| Public | Source metadata, quotes (short), grades, receipts | Normal storage |
| Private | Uploaded documents, watch definitions, decisions, inbox | Field-encrypted + RLS |
| Secret | API keys, encryption key, service-role key | Env only, server-side only |
| Forbidden | Identifiers of a specific, real, identifiable person | Rejected at input; never stored |

## Controls

### Authentication and authorization
- Supabase Auth (JWT). Anonymous visitors: read-only access to precomputed results.
- **RLS on every table** (default deny). Policies: `user_id = auth.uid()` for private tables; public
  read for precomputed results only. A **policy test suite** (two users, attempts cross-access) runs in CI.
- Service-role key used only in server code (route handlers/worker), never imported into client bundles
  (lint rule + build check that greps the client bundle for the key prefix).

### Encryption
- TLS everywhere; HSTS; managed Postgres encryption at rest (verify provider statement).
- **Application-level AES-256-GCM** for uploaded documents and watch definitions: random 96-bit nonce
  per record, authenticated data = `user_id|record_id`, key `APP_ENCRYPTION_KEY` (32 bytes, base64) from
  env; key version stored with the record to allow rotation. Decrypt in memory only for the request.
  Storage bucket private; signed URLs short-lived.
- Never log decrypted content or prompts.

### Input safety and prompt-injection defence
- **Identifier filter** (code) on all free-text input: reject patterns resembling national IDs, phones,
  emails, names after a person-reference cue; warn the user.
- **Retrieved content is data.** Wrap in tagged blocks with random per-call delimiters; the system
  prompt (P0) states that instructions inside tagged data must be ignored and reported; outputs are
  schema-validated, so instructions cannot create new fields or tools.
- **Capability minimisation:** agents have no write tools, no network except allow-listed fetch via
  tools, no access to other users' data; tool arguments are validated (zod) and URL-checked (https,
  allow-list for guideline domains, no private IP ranges, no redirects to disallowed hosts — SSRF guard).
- **Output checks:** deterministic verification (module 03) means injected claims cannot reach the UI
  without a real quote from a fetched source.
- **Dependency and supply-chain:** lockfile, `pnpm audit` in CI, secret scanning, minimal dependencies.
- **Web hardening:** strict CSP (no inline scripts, nonce-based), `X-Content-Type-Options`, frame
  protection, referrer policy; sanitise any rendered HTML (render quotes as text, never as HTML).

### Constant verification and agent-in-the-loop
- Every displayed claim passes the verifier; the `VerifiedClaim` type is the only input to views.
- Human checkpoints: confirmation before saving a watch; explicit decisions on divergences;
  "mark as reviewed" on algorithms (stored per user, never altering the content); safety-critical items
  flagged `needs_expert_review`.
- Audit log (append-only table): who decided what and when; no content.

### Cost and abuse protection
- **Per-run cost cap** (`RUN_COST_CAP_USD`), enforced by the agent harness before each call using
  token counts and price table (config; prices to be verified).
- **Global daily budget** (`DAILY_BUDGET_USD`) with a kill switch env flag that makes the app serve
  precomputed results only; budget ledger table updated per run.
- **Rate limits:** per IP and per user (sliding window), stricter for run creation than for reads;
  Turnstile-style bot check if public abuse appears (note: do not bypass CAPTCHAs in automation).
- **Concurrency limits** on live runs; queue with position feedback.
- **Anonymous = precomputed only**; live runs require sign-in.

### Privacy and data lifecycle
- **Ephemeral by default:** scenario text is not stored; runs store ids, structured scenario fields,
  stage metadata, claims (public data), receipts.
- Retention: source passages cached with TTL (e.g., 7 days); private documents deleted on user request
  (hard delete of rows and storage objects) and by default after N days in the demo.
- Data export and deletion endpoints for the user's private data.
- Colombia Law 1581 of 2012 is noted as future compliance scope; no claim of compliance now.

## Contracts
`BudgetLedger`, `AuditEvent = { id, userId, action, entityId, at }`, `RateLimitPolicy`,
`EncryptedBlob = { v: number, nonce, ciphertext, tag }`.

## Failure modes
| Failure | Handling |
| --- | --- |
| Key missing/rotated | Fail closed; private features disabled with clear message |
| Budget ledger out of sync | Conservative estimate (round up); kill switch available manually |
| Injection in an uploaded doc | Treated as data; flagged if injection patterns detected; never executed |
| Abuse spike | Rate limit + anonymous precomputed-only mode |
| Leaked key in repo | Secret scanner blocks CI; rotate immediately; history cleanup |

## Evaluation
- **RLS tests:** 100% of cross-user read/write attempts denied across all private tables.
- **Encryption:** round-trip, tamper (flip a byte → auth failure), wrong-user AAD → failure; key
  rotation test.
- **Injection suite:** ≥20 fixtures (documents/web snippets with "ignore previous instructions",
  fake tool calls, fake JSON, claims in invisible text). Metric: attack success rate (any injected
  instruction followed or injected claim displayed) = 0; report per attack type.
- **Identifier filter:** fixtures of IDs/phones/emails/names rejected ≥95% (report false positives on
  100 normal clinical phrases ≤3%).
- **SSRF/URL guard:** private IPs, redirects, non-https, oversized responses blocked 100%.
- **Cost:** simulated flood of 200 requests: budget kill switch triggers before cap exceeded by more than
  one run's cost; anonymous users never trigger model calls.
- **CI gates:** lint, typecheck, tests, audit, secret scan, client-bundle secret check.
- **Headers/CSP:** automated header check in CI against the preview URL.

## Build notes
RLS migrations and tests on Day 1. Add the budget guard to the agent harness (01) before any real
model call. Keep a `SECURITY.md` listing controls and honest limits.

## Acceptance
No secrets in repo or bundle; RLS tests green; injection suite shows zero successful attacks; demo URL
cannot be used to exhaust the credit budget.
