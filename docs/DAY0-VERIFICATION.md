# Day-0 verification (2026-10-26)

Checked against official pages on 2026-10-26. Re-check anything marked ⚠ on Day 1 before relying on it.
Sources: dev.meta.ai/docs (overview, quickstart, models, pricing-rate-limits, structured-output,
tool-calling, search-grounding, reasoning, muse-spark-open/deploy); reactome.org/license;
ebi.ac.uk/chebi/about; guidetopharmacology.org/about.jsp; UniProt licence file (DDBJ mirror).

## 1. Meta Model API

| Item | Verified finding | Impact on the build |
| --- | --- | --- |
| Base URL / auth | `https://api.meta.ai/v1`, `Authorization: Bearer <key>`; docs use env name `MODEL_API_KEY` | Use `META_API_KEY` or rename to `MODEL_API_KEY`; keep one name everywhere |
| Compatibility | Drop-in with OpenAI SDK, Anthropic SDK; protocols: Responses, Chat Completions, Messages | Use the OpenAI TypeScript SDK with `baseURL` behind `src/lib/meta/client.ts`. **Prefer the Responses API** (docs recommend it for multi-step agents; search grounding only works there) |
| Model ids | `muse-spark-1.3` (recommended), `muse-spark-1.2`, `muse-spark-1.1`; `muse-wonder-1.0` (preview, more expensive); `muse-voice-transcribe-1.0`; `sam-3.1`; `muse-image-1.0`. Live list: `GET /v1/models` | Default `muse-spark-1.3`. Log `GET /v1/models` output on Day 1 |
| Contributor variants | `*-contributor` ids: content **may be used to train Meta models** (cheaper). Standard ids: not used for training | Confirmed: never use `-contributor` ids |
| Context | 1,048,576 tokens for Muse Spark | Long-context reading of local documents is viable |
| Reasoning | `reasoning.effort` (Responses) / `reasoning_effort` (Chat): `minimal, low, medium, high, xhigh, max`; `none` is rejected; reasoning tokens billed as output | Map tiers: T0 `minimal`/`low`, T1 `medium`, T2 `high` (`xhigh`/`max` only if measured to help) |
| Structured output | JSON Schema via `text.format` (Responses) or `response_format` (Chat). Constrained decoding. **No recursive `$ref` (HTTP 400); max nesting depth 10; limits on properties/enum size.** `strict` defaults false | ⚠ Our recursive `MapNode` tree must be sent **flat** (`nodes[]` with `parentId`) and nested in code. Keep every agent schema ≤ depth 10; still validate with zod (docs say always validate) |
| Structured output, `strict: true` — **found 2026-10-27 against the live API, not in the docs pages checked on Day 0** | With `strict: true`, every object's `required` array must list **every** key in `properties` — a zod `.optional()` field (which `zod-to-json-schema` simply omits from `required`) is rejected with HTTP 400: `'required' is required to be supplied and to be an array including every key in properties`. The standard fix: mark the field required anyway and make its *type* nullable instead (model sends explicit `null` for "absent") | Implemented in `src/lib/agents/json-schema.ts` (`toStructuredOutputFormat`): every property becomes required; originally-optional ones get `'null'` added to their type (or an `anyOf` null branch for object/union types). `stripNullFields` (`run-agent.ts`) converts the model's explicit `null`s back to "key absent" before zod validation, since our zod schemas use plain `.optional()` throughout |
| Reasoning tokens vs `max_output_tokens` — **found 2026-10-27, live smoke test** | Reasoning tokens are drawn from the *same* `max_output_tokens` budget as the final answer, even at `reasoning.effort: 'minimal'`. A 300-token cap on the P0+P1 router prompt (~711 input tokens) was fully consumed by reasoning (298 tokens) with `status: "incomplete", incomplete_details.reason: "max_output_tokens"` — no JSON was ever emitted | Module 01's "300 output tokens" budget for the router was too tight; `src/lib/pipeline/create-run.ts` now requests 800. Any other T0/T1/T2 agent limit sketched in the architecture docs should be treated as a starting point, not a verified number, until it's been run live |
| Tool calling | Function tools on Responses and Chat; parallel calls default on; **`tool_choice` only `auto`** (`none`/`required`/named → 400); `max_tool_calls` caps only built-in tools; function names `^[a-zA-Z0-9_.-]+$`; tool search (`defer_loading`) available | The model may answer without calling a tool: code must handle that and cap loop turns itself (our `maxSteps`). Do not rely on forcing a tool |
| Search grounding | `{"type":"web_search"}` in `tools` of **Responses API only** (not Chat Completions). Returns `url_citation` annotations; `include: ["web_search_call.results"]` returns title/url/snippet. Model decides whether to search. **Domain restriction not documented for Responses** (Messages API rejects `allowed_domains`). Docs warn quality is still improving and multi-hop research is unreliable | Use only for discovery of URLs; re-fetch pages ourselves for quotes (already the design). Do not expect domain filters; filter results in code against our allow-list |
| Embeddings | **Not documented** in the API pages checked | Decision: no vectors. Local pool = Postgres full-text + long-context read (already the fallback in SPEC §7) |
| Scheduled tasks / automations | **Not an API feature** (Muse Code has workflows; that is a CLI feature) | Decision: our own job table + cron/worker (module 09 default) |
| Background mode | `background: true` responses supported; capped at 600 submissions/min/team | Optional for long jobs |
| Prompt caching, token counting | Documented (`/docs/prompt-caching`, `/docs/token-counting`) | Put the long static preamble (P0 + schemas) first to benefit from caching; use token counting for budget estimates |
| Price (Standard, per 1M tokens) | `muse-spark-1.3`: input **$1.25**, cached input **$0.15**, output **$4.25**. `muse-wonder-1.0`: $4.00 / $0.20 / $20.00. Search grounding: **$2.50 per 1,000 queries** | Confirms earlier third-party figures. Put in `src/lib/meta/prices.ts` |
| Rate limits | Per team: `muse-spark-1.3` 3,000 RPM, 4,000,000 TPM | Not a bottleneck; our own budget guard is |
| Credits | Docs say pay-as-you-go, no promo terms on the page; the hackathon credits ($150) are on your account | Check balance in the console before launch; set budget guards |
| Muse Spark Open | Open-weight, **not hosted on Model API**; run via Baseten: model id `meta-models/muse-spark-open`, base `https://inference.baseten.co/v1`, key `BASETEN_API_KEY`; pricing on Baseten page; text/image/video/audio inputs | ⚠ Earlier notes used `meta-models/muse-spark-open-1026`; the doc page now shows `meta-models/muse-spark-open`. Also ⚠ **ask organizers whether Baseten-served Muse Spark Open counts as "Meta Model API" use**; if unclear, run **everything on `muse-spark-1.3`** with `minimal`/`low` effort for cheap steps (simpler, safe) |

### Decisions taken from this verification
1. Single provider path: Meta Model API, Responses API, `muse-spark-1.3`. T0/T1/T2 differ by `reasoning.effort` only (no second provider needed on Day 1). Add Muse Spark Open via Baseten later only if cost requires it and the organizers confirm eligibility.
2. Search grounding: Responses API, `web_search` tool; treat results as untrusted discovery.
3. No embeddings; no native scheduling. Both were already fallbacks.
4. Flatten recursive schemas; depth ≤ 10; validate everything with zod.
5. Agent loops: code-enforced `maxSteps`; handle "no tool call" replies.
6. Rename env var consistently (`META_API_KEY` in our docs; map to the SDK `apiKey`).

## 2. Licenses for the mechanism module

| Source | Licence (as stated) | Use in our project | Required action |
| --- | --- | --- | --- |
| **Reactome** | Data: **CC0** (commercial use allowed, attribution encouraged, not required). Illustrations/icons/art/branding: **CC BY 4.0**. Software: Apache 2.0. | Use pathway/reaction data for corroboration. **Do not copy Reactome diagrams/icons** unless crediting under CC BY 4.0 | Credit Reactome in the UI footer and README anyway (good practice). Draw our own glyphs |
| **IUPHAR/BPS Guide to PHARMACOLOGY** | Page says database licensed under **ODbL** and content under **CC BY-SA 4.0** (share-alike). Site now requires registration for some access; separate "commercial access fees" page exists; content described as for educational/scientific research purposes | ⚠ Share-alike and commercial terms are the risk for a product. For the hackathon, use it **only as a background corroboration check** (we store at most `corroboratedBy: 'gtopdb'` flags and ids, not copied text) and attribute | Read the citing page and the commercial-access page before storing any data. If terms are unclear, make GtoPdb corroboration **optional/off** and rely on Reactome + UniProt + ChEBI |
| **UniProt** | **CC BY 4.0** (copyright statement must be kept on redistributed files) | Cross-reference ids and names via the REST API | Attribute UniProt; do not redistribute bulk files in the repo |
| **ChEBI** | **CC BY 4.0**, plus EMBL-EBI terms of use; asks to cite Malik et al. 2025 (*Nucleic Acids Research*) | Cross-reference ids | Attribute ChEBI; cite in README |
| **KEGG** | Restrictive licence | **Do not use** | — |

Not legal advice. Add a `docs/ATTRIBUTIONS.md` listing each source, licence, link and how we use it.

## 3. Day 1 re-verification (2026-10-27, with the real `META_API_KEY`)

| Check | Result |
| --- | --- |
| `GET /v1/models` | HTTP 200. 9 live ids: `muse-spark-1.3` (recommended, confirmed present), `muse-spark-1.2`, `muse-spark-1.1`, `muse-spark-1.3-contributor`, `muse-spark-1.2-contributor` (never used — contributor variants), `muse-wonder-1.0`, `muse-voice-transcribe-1.0`, `sam-3.1`, `muse-image-1.0`. Matches the 2026-10-26 notes above. |
| Structured output (Responses API, `text.format` json_schema, `strict: true`, `reasoning.effort: 'minimal'`) | HTTP 200. Returned `{"sentiment":"positive"}`, exactly conforming to the schema. Confirms constrained decoding works as documented. |
| `web_search` tool (Responses API, `tools:[{type:'web_search'}]`, `include:['web_search_call.results']`) | HTTP 200. Model emitted a `web_search_call` with real, dated results (titles/urls/snippets) for an Oct 27 2026 query, confirming search grounding is live and working as `scout`-style discovery (not yet followed by `url_citation` annotations in this smoke test — expected to appear once the model composes its final answer from the results). |
| `SUPABASE_SERVICE_ROLE_KEY` | HTTP 200 against the PostgREST root (the same endpoint returned 401 "Only the `service_role` API key can be used for this endpoint" for the anon key) — confirms the service key is valid for server-side use. No writes performed. |
| Account credit balance | **Not verifiable via API** — no balance/billing endpoint found in the pages checked. Check manually in the Meta developer console before relying on the $150 budget. |

Decision: no changes needed to the Day-0 decisions above; `muse-spark-1.3` via the Responses API is confirmed usable end-to-end (models list, structured output, search grounding) with the real key.

## 4. Vercel plan limits (verified 2026-10-27 against `vercel.com/docs/functions/limitations` and `vercel.com/docs/cron-jobs/usage-and-pricing`, both last updated 2026)

| Item | Hobby | Pro / Enterprise | Impact on the build |
| --- | --- | --- | --- |
| Function max duration | 300s default **and** maximum | 300s default, 800s maximum (GA), 1800s extended maximum (Beta, needs Fluid compute + runtime opt-in) | Long stages (full pipeline run, mechanism extraction fan-out) must still be chunked/resumable (module 01/09 design already assumes this) regardless of plan — do not depend on the 800s/1800s tiers being available for the demo |
| Function memory | 2 GB / 1 vCPU (default = max) | 2 GB default, 4 GB / 2 vCPU max | Not a bottleneck for our workloads |
| Cron jobs per project | 100 | 100 | Plenty for watches (module 09) |
| Cron minimum interval | **Once per day**, ±59 min precision; more-frequent expressions fail at deploy time | Once per minute, per-minute precision | **Confirms the existing fallback decision**: if the hackathon deploy stays on Hobby, watches cannot poll sub-daily via Vercel Cron — use the job table + a Supabase Edge Function/pg_cron trigger (already the module 09 default) for anything more frequent than daily, and reserve Vercel Cron for the once-daily digest |

Sources: [Vercel Functions Limits](https://vercel.com/docs/functions/limitations), [Usage & Pricing for Cron Jobs](https://vercel.com/docs/cron-jobs/usage-and-pricing).

## 5. GtoPdb commercial terms (verified 2026-10-27)

Confirmed via [Commercial Access Fees for GtoPdb](https://blog.guidetopharmacology.org/2025/06/19/commercial-access-fees-for-gtopdb/): GtoPdb now charges commercial users an annual fee (£500 small / £1,000 medium / £250+ large organisations) arranged by email with the curatorial team; academic/non-commercial use remains free. A public hackathon demo's commercial status is unclear and not worth resolving mid-build.
**Decision confirmed unchanged:** GtoPdb corroboration stays optional and **off by default**; rely on Reactome (CC0 data) + UniProt (CC BY 4.0) + ChEBI (CC BY 4.0) for cross-referencing.

## 6. Still open
- Whether Baseten-served Muse Spark Open satisfies the hackathon's Meta-model requirement: **unresolved** — no official hackathon rules page was found that mentions Baseten or defines which "open-weights" hosting counts; Meta's own developer posts mention Meta Model API, Muse Code and "our open-weights models" without naming a hosting provider. Ask in #office-hours before using it; until answered, **run everything on `muse-spark-1.3` via the Meta Model API** (already the Day-0 decision, now reinforced since eligibility can't be confirmed from public docs).
- Exact account credit balance — check manually in the console.
- Final list of 15 conditions, clinical reviewer, product name.
