# DECISIONS

Log every deviation from `docs/SPEC.md` or the architecture files: date, decision, reason.

| Date | Decision | Reason |
| --- | --- | --- |
| 2026-10-26 | Stack: Next.js (App Router) + React + TypeScript, Supabase, Vercel, zod, vitest, pnpm | Chosen by the founder; fits 9-day build |
| 2026-10-26 | Meta Model API via Responses API, `muse-spark-1.3`; tiers by `reasoning.effort` | `docs/DAY0-VERIFICATION.md` |
| 2026-10-26 | No embeddings; no native scheduling (job table + cron) | Not offered by the API |
| 2026-10-26 | Product name provisional (candidates: BenchBark, Sentilens, Sentinel, Pointer) | Decide after availability check; Vercel subdomain is enough for the hackathon |
| 2026-10-27 | Firecrawl or similar scraper: not in v1; add as optional fallback adapter only if plain fetch reads <85% of must-find sources on Day 2 | Keeps verification on raw text; fewer third-party dependencies |
| 2026-10-27 | `src/lib/meta/client.ts` wraps the Responses API with raw `fetch`, not the OpenAI SDK that `docs/DAY0-VERIFICATION.md` suggested as an implementation detail | Verified end-to-end (GET /v1/models, structured output, web_search) with raw fetch on Day 1; keeps one fewer dependency per module 10's "minimal dependencies" rule. SPEC §12 only requires the client live behind `lib/meta/client.ts`, not a specific SDK |
| 2026-10-27 | `runAgent`'s `AgentResult` failure reason adds `'api_error'` beyond the `invalid\|timeout\|budget\|abstain` set sketched in `docs/architecture/00-overview.md` | Module 01's own failure-mode table requires telling a transport/5xx failure (→ backoff, module 01) apart from a schema-invalid model output (→ drop/abstain); the overview sketch didn't give that a reason code |
