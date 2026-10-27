import type { EuropePmcClient } from '../tools/europe-pmc';
import type { PubmedClient, PubmedSummary } from '../tools/pubmed';
import { CandidateSourceSchema, type CandidateSource, type SearchPlan, type SearchQuery } from '../schemas/retrieval';

// Module 01/02 request lifecycle step "retrieve": executes a `SearchPlan` (proposed
// by the `search-planner` agent, P3) against the real connectors. This is
// deterministic code, not an agent — "model proposes [what to search], code
// verifies/executes [how]" (CLAUDE.md rule 5's principle applied to retrieval).
//
// Only the 'pubmed' and 'europe_pmc' families have a connector today. 'guideline'/
// 'web'/'local' queries are recorded as skipped, not silently dropped or faked:
// 'web' needs the Meta API's own web_search tool wired through an agent (not a plain
// fetch), 'guideline' and 'local' need a configured domain allow-list / document pool
// that doesn't exist yet (SECURITY.md "Known gaps"). A per-query failure (network
// error, non-2xx) never aborts the whole plan — CLAUDE.md rule 12 / module 01's
// failure table: "one source times out -> continue without it."

const DEFAULT_MAX_CONCURRENCY = 4;
const DEFAULT_PER_QUERY_TIMEOUT_MS = 8000;
const PUBMED_RETMAX = 15;
const EUROPE_PMC_PAGE_SIZE = 15;

const EXECUTABLE_FAMILIES = new Set<SearchQuery['family']>(['pubmed', 'europe_pmc']);

export interface ExecutePlanDeps {
  pubmed: PubmedClient;
  europePmc: EuropePmcClient;
  maxConcurrency?: number;
  perQueryTimeoutMs?: number;
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
    if (!EXECUTABLE_FAMILIES.has(query.family)) {
      return { kind: 'skipped', reason: `No connector implemented yet for family "${query.family}"` };
    }
    try {
      const candidates = await withTimeout(
        query.family === 'pubmed' ? runPubmedQuery(query, deps) : runEuropePmcQuery(query, deps),
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
