# DECISIONS

Log every deviation from `docs/SPEC.md` or the architecture files: date, decision, reason.

| Date | Decision | Reason |
| --- | --- | --- |
| 2026-10-26 | Stack: Next.js (App Router) + React + TypeScript, Supabase, Vercel, zod, vitest, pnpm | Chosen by the founder; fits 9-day build |
| 2026-10-26 | Meta Model API via Responses API, `muse-spark-1.3`; tiers by `reasoning.effort` | `docs/DAY0-VERIFICATION.md` |
| 2026-10-26 | No embeddings; no native scheduling (job table + cron) | Not offered by the API |
| 2026-10-26 | Product name provisional (candidates: BenchBark, Sentilens, Sentinel, Pointer) | Decide after availability check; Vercel subdomain is enough for the hackathon |
| 2026-10-27 | Firecrawl or similar scraper: not in v1; add as optional fallback adapter only if plain fetch reads <85% of must-find sources on Day 2 | Keeps verification on raw text; fewer third-party dependencies |
