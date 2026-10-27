import { createRateLimiter, type RateLimiter } from './rate-limiter';
import { createTtlCache, type TtlCache } from './ttl-cache';

// Module 02 PubMed connector: "esearch, efetch [we use esummary instead of efetch for
// metadata — see note below]; structured; cache 24h; respect rate limit (3/s without
// key)". esummary (not the XML-only efetch) is used because it already returns
// structured JSON with `pubtype` — exactly what module 02's source-classifier needs
// ("Code overrides the model when metadata is decisive: Practice Guideline, Systematic
// Review, Randomized Controlled Trial") — without an XML parser dependency. Abstract
// full text (for quote extraction) is Europe PMC's job (pubmed.ts never returns it).

const EUTILS_BASE = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils';
const RATE_LIMIT_PER_SECOND_NO_KEY = 3;
const RATE_LIMIT_PER_SECOND_WITH_KEY = 9; // NCBI allows ~10/s with a key; stay under it
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

export interface PubmedSearchResult {
  pmids: string[];
}

export interface PubmedSummary {
  pmid: string;
  title: string;
  journal?: string;
  pubDate?: string;
  pubTypes: string[];
  doi?: string;
}

export interface PubmedClient {
  search(query: string, options?: { retmax?: number }): Promise<PubmedSearchResult>;
  fetchSummaries(pmids: string[]): Promise<PubmedSummary[]>;
}

export interface CreatePubmedClientOptions {
  apiKey?: string;
  fetchImpl?: typeof fetch;
  cache?: TtlCache<unknown>;
  rateLimiter?: RateLimiter;
}

interface EsearchResponse {
  esearchresult?: { idlist?: string[] };
}

interface EsummaryItem {
  title?: string;
  source?: string;
  fulljournalname?: string;
  pubdate?: string;
  pubtype?: string[];
  articleids?: { idtype: string; value: string }[];
}

interface EsummaryResponse {
  result?: { uids?: string[] } & Record<string, EsummaryItem | string[] | undefined>;
}

export function createPubmedClient(options: CreatePubmedClientOptions = {}): PubmedClient {
  const fetchImpl = options.fetchImpl ?? fetch;
  const cache = options.cache ?? createTtlCache<unknown>(CACHE_TTL_MS);
  const rateLimiter =
    options.rateLimiter ??
    createRateLimiter(options.apiKey ? RATE_LIMIT_PER_SECOND_WITH_KEY : RATE_LIMIT_PER_SECOND_NO_KEY, 1000);

  function buildParams(extra: Record<string, string>): URLSearchParams {
    const params = new URLSearchParams({ retmode: 'json', ...extra });
    if (options.apiKey) params.set('api_key', options.apiKey);
    return params;
  }

  async function search(query: string, { retmax = 20 }: { retmax?: number } = {}): Promise<PubmedSearchResult> {
    const cacheKey = `search:${query}:${retmax}`;
    const cached = cache.get(cacheKey) as PubmedSearchResult | undefined;
    if (cached) return cached;

    const params = buildParams({ db: 'pubmed', term: query, retmax: String(retmax) });
    const json = await rateLimiter.schedule(async () => {
      const res = await fetchImpl(`${EUTILS_BASE}/esearch.fcgi?${params.toString()}`);
      if (!res.ok) throw new Error(`PubMed esearch failed: HTTP ${res.status}`);
      return (await res.json()) as EsearchResponse;
    });

    const result: PubmedSearchResult = { pmids: json.esearchresult?.idlist ?? [] };
    cache.set(cacheKey, result);
    return result;
  }

  async function fetchSummaries(pmids: string[]): Promise<PubmedSummary[]> {
    if (pmids.length === 0) return [];

    const resolved = new Map<string, PubmedSummary>();
    const toFetch: string[] = [];
    for (const pmid of pmids) {
      const cached = cache.get(`summary:${pmid}`) as PubmedSummary | undefined;
      if (cached) resolved.set(pmid, cached);
      else toFetch.push(pmid);
    }

    if (toFetch.length > 0) {
      const params = buildParams({ db: 'pubmed', id: toFetch.join(',') });
      const json = await rateLimiter.schedule(async () => {
        const res = await fetchImpl(`${EUTILS_BASE}/esummary.fcgi?${params.toString()}`);
        if (!res.ok) throw new Error(`PubMed esummary failed: HTTP ${res.status}`);
        return (await res.json()) as EsummaryResponse;
      });

      const uids = (json.result?.uids as string[] | undefined) ?? [];
      for (const uid of uids) {
        const item = json.result?.[uid] as EsummaryItem | undefined;
        if (!item) continue;
        const summary: PubmedSummary = {
          pmid: uid,
          title: item.title ?? '',
          journal: item.fulljournalname ?? item.source,
          pubDate: item.pubdate,
          pubTypes: item.pubtype ?? [],
          doi: item.articleids?.find((a) => a.idtype === 'doi')?.value,
        };
        cache.set(`summary:${uid}`, summary);
        resolved.set(uid, summary);
      }
    }

    return pmids.map((pmid) => resolved.get(pmid)).filter((s): s is PubmedSummary => s !== undefined);
  }

  return { search, fetchSummaries };
}
