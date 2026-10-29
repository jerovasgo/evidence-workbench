import type { MetaClient } from '@/shared/meta';
import { assertSafeUrl, type BudgetGuard } from '@/shared/security';
import { findWebSources } from '../agents/web-source-finder';
import { normalizeUrl } from '../curation/normalize-identifiers';
import type { EuropePmcClient } from '../tools/europe-pmc';
import { fetchUrlText } from '../tools/fetch-url-text';
import type { PubmedClient, PubmedSummary } from '../tools/pubmed';
import { CandidateSourceSchema, type CandidateSource, type SearchPlan, type SearchQuery } from '../schemas/retrieval';

// Module 01/02 request lifecycle step "retrieve": executes a `SearchPlan` (proposed
// by the `search-planner` agent, P3) against the real connectors. This is
// deterministic code, not an agent — "model proposes [what to search], code
// verifies/executes [how]" (CLAUDE.md rule 5's principle applied to retrieval).
//
// 'pubmed'/'europe_pmc' always run. 'web'/'standards_body' run too when `deps.webSearch`
// is provided: `findWebSources` (web_search grounding) proposes candidate URLs,
// `assertSafeUrl` keeps only ones on the allow-list (the model's own domain
// preference is a hint, never trusted alone — DAY0-VERIFICATION.md: "domain
// restriction not documented for Responses ... filter results in code"), then
// `fetchUrlText` re-fetches the page itself rather than trusting the search
// snippet, so quote verification always runs against real fetched text. Omitting
// `webSearch` keeps the old behavior (skip, not fake) for callers/tests that don't
// wire it. 'local' has no connector yet (module 10/documents feature, not built) and
// is always skipped. A per-query failure never aborts the whole plan — CLAUDE.md
// rule 12 / module 01's failure table: "one source times out -> continue without it."

const DEFAULT_MAX_CONCURRENCY = 4;
const DEFAULT_PER_QUERY_TIMEOUT_MS = 8000;
const PUBMED_RETMAX = 15;
const EUROPE_PMC_PAGE_SIZE = 15;
const MAX_WEB_RESULTS_PER_QUERY = 5;

export interface WebSearchDeps {
  runId: string;
  metaClient: MetaClient;
  budgetGuard: BudgetGuard;
  allowedDomains: readonly string[];
  /** Injectable for tests; defaults to the global fetch (passed through to fetchUrlText). */
  fetchImpl?: typeof fetch;
}

export interface ExecutePlanDeps {
  pubmed: PubmedClient;
  europePmc: EuropePmcClient;
  maxConcurrency?: number;
  perQueryTimeoutMs?: number;
  webSearch?: WebSearchDeps;
}

export interface SkippedQuery {
  query: SearchQuery;
  reason: string;
}

export interface FailedQuery {
  query: SearchQuery;
  error: string;
}

export interface ExecutePlanResult {
  candidates: CandidateSource[];
  skipped: SkippedQuery[];
  failed: FailedQuery[];
}

class QueryTimeoutError extends Error {}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new QueryTimeoutError(`Query timed out after ${timeoutMs}ms`)), timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer)) as Promise<T>;
}

function extractYear(pubDate: string | undefined): number | undefined {
  const match = pubDate?.match(/\d{4}/);
  return match ? Number(match[0]) : undefined;
}

function pubmedSummaryToCandidate(summary: PubmedSummary): CandidateSource {
  return CandidateSourceSchema.parse({
    tempId: `pubmed:${summary.pmid}`,
    family: 'pubmed',
    title: summary.title,
    issuer: summary.journal,
    year: extractYear(summary.pubDate),
    doi: summary.doi,
    pmid: summary.pmid,
    url: `https://pubmed.ncbi.nlm.nih.gov/${summary.pmid}/`,
    pubTypes: summary.pubTypes.length > 0 ? summary.pubTypes : undefined,
  });
}

async function runPubmedQuery(query: SearchQuery, deps: ExecutePlanDeps): Promise<CandidateSource[]> {
  const { pmids } = await deps.pubmed.search(query.text, { retmax: PUBMED_RETMAX });
  if (pmids.length === 0) return [];
  const summaries = await deps.pubmed.fetchSummaries(pmids);
  return summaries.map(pubmedSummaryToCandidate);
}

async function runEuropePmcQuery(query: SearchQuery, deps: ExecutePlanDeps): Promise<CandidateSource[]> {
  const results = await deps.europePmc.search(query.text, { pageSize: EUROPE_PMC_PAGE_SIZE });
  return results.map((item) =>
    CandidateSourceSchema.parse({
      tempId: `europe_pmc:${item.source}:${item.id}`,
      family: 'europe_pmc',
      title: item.title,
      year: item.pubYear,
      doi: item.doi,
      pmid: item.pmid,
      url: `https://europepmc.org/article/${item.source}/${item.id}`,
      isOpenAccess: item.isOpenAccess,
    }),
  );
}

async function runWebQuery(query: SearchQuery, webSearch: WebSearchDeps): Promise<CandidateSource[]> {
  const searchResult = await findWebSources(
    webSearch.runId,
    { query: query.text, preferredDomains: webSearch.allowedDomains },
    { metaClient: webSearch.metaClient, budgetGuard: webSearch.budgetGuard },
  );
  if (!searchResult.ok) {
    throw new Error(`web_search failed (${searchResult.reason}): ${searchResult.detail}`);
  }

  const trusted = searchResult.results
    .filter((r) => {
      try {
        assertSafeUrl(r.url, webSearch.allowedDomains);
        return true;
      } catch {
        return false;
      }
    })
    .slice(0, MAX_WEB_RESULTS_PER_QUERY);

  const fetched = await Promise.all(
    trusted.map(async (r): Promise<CandidateSource | null> => {
      try {
        const page = await fetchUrlText(r.url, { allowedDomains: webSearch.allowedDomains, fetchImpl: webSearch.fetchImpl });
        return CandidateSourceSchema.parse({
          tempId: `web:${normalizeUrl(page.finalUrl)}`,
          family: query.family,
          title: r.title || page.finalUrl,
          url: page.finalUrl,
          snippet: r.snippet || undefined,
        });
      } catch {
        return null; // this one page failing to fetch doesn't fail the whole query
      }
    }),
  );

  return fetched.filter((c): c is CandidateSource => c !== null);
}

/** Runs `fn` over `items` with at most `limit` in flight at once. */
async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;

  async function worker(): Promise<void> {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      results[i] = await fn(items[i]!);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

export async function executeSearchPlan(plan: SearchPlan, deps: ExecutePlanDeps): Promise<ExecutePlanResult> {
  const maxConcurrency = deps.maxConcurrency ?? DEFAULT_MAX_CONCURRENCY;
  const timeoutMs = deps.perQueryTimeoutMs ?? DEFAULT_PER_QUERY_TIMEOUT_MS;

  type QueryOutcome =
    | { kind: 'ok'; candidates: CandidateSource[] }
    | { kind: 'skipped'; reason: string }
    | { kind: 'failed'; error: string };

  async function runOne(query: SearchQuery): Promise<QueryOutcome> {
    const isWebFamily = query.family === 'web' || query.family === 'standards_body';
    if (isWebFamily && !deps.webSearch) {
      return { kind: 'skipped', reason: `No connector implemented yet for family "${query.family}" (webSearch deps not configured)` };
    }
    if (!isWebFamily && query.family !== 'pubmed' && query.family !== 'europe_pmc') {
      return { kind: 'skipped', reason: `No connector implemented yet for family "${query.family}"` };
    }
    try {
      const candidates = await withTimeout(
        query.family === 'pubmed'
          ? runPubmedQuery(query, deps)
          : query.family === 'europe_pmc'
            ? runEuropePmcQuery(query, deps)
            : runWebQuery(query, deps.webSearch!),
        timeoutMs,
      );
      return { kind: 'ok', candidates };
    } catch (err) {
      return { kind: 'failed', error: err instanceof Error ? err.message : String(err) };
    }
  }

  const outcomes = await mapWithConcurrency(plan.queries, maxConcurrency, runOne);

  const result: ExecutePlanResult = { candidates: [], skipped: [], failed: [] };
  for (let i = 0; i < plan.queries.length; i++) {
    const query = plan.queries[i]!;
    const outcome = outcomes[i]!;
    if (outcome.kind === 'ok') result.candidates.push(...outcome.candidates);
    else if (outcome.kind === 'skipped') result.skipped.push({ query, reason: outcome.reason });
    else result.failed.push({ query, error: outcome.error });
  }
  return result;
}
