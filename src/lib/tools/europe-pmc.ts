import { extractReadableText } from './html-text';

// Module 02 Europe PMC connector: "open full text where available — preferred for
// quote verification." Only metadata search and a raw full-text fetch are implemented
// here; splitting full text into located `Passage`s is extract-stage (module 03) work
// and is not done here — this tool only returns the fetched, tag-stripped text.

const EUROPE_PMC_BASE = 'https://www.ebi.ac.uk/europepmc/webservices/rest';

export interface EuropePmcResultItem {
  id: string;
  source: string;
  pmid?: string;
  doi?: string;
  title: string;
  authorString?: string;
  pubYear?: number;
  isOpenAccess: boolean;
  pubTypes: string[];
}

export interface EuropePmcClient {
  search(query: string, options?: { pageSize?: number }): Promise<EuropePmcResultItem[]>;
  /** Returns null (not an error) when the article has no full text available (e.g. HTTP 404). */
  fetchFullText(source: string, id: string): Promise<string | null>;
}

export interface CreateEuropePmcClientOptions {
  fetchImpl?: typeof fetch;
}

interface RawResultItem {
  id: string;
  source: string;
  pmid?: string;
  doi?: string;
  title: string;
  authorString?: string;
  pubYear?: string;
  isOpenAccess?: string;
  // Verified live 2026-10-27: the real API returns a single "; "-separated string
  // (e.g. "research-article; journal article"), not the `pubTypeList.pubType` array
  // some older docs/examples show. Handle both so a future API change doesn't break.
  pubType?: string;
  pubTypeList?: { pubType?: string[] };
}

function parsePubTypes(item: RawResultItem): string[] {
  if (item.pubTypeList?.pubType) return item.pubTypeList.pubType;
  if (item.pubType) {
    return item.pubType
      .split(';')
      .map((t) => t.trim())
      .filter((t) => t.length > 0);
  }
  return [];
}

export function createEuropePmcClient(options: CreateEuropePmcClientOptions = {}): EuropePmcClient {
  const fetchImpl = options.fetchImpl ?? fetch;

  async function search(query: string, { pageSize = 20 }: { pageSize?: number } = {}): Promise<EuropePmcResultItem[]> {
    const params = new URLSearchParams({ query, format: 'json', pageSize: String(pageSize) });
    const res = await fetchImpl(`${EUROPE_PMC_BASE}/search?${params.toString()}`);
    if (!res.ok) {
      throw new Error(`Europe PMC search failed: HTTP ${res.status}`);
    }
    const json = (await res.json()) as { resultList?: { result?: RawResultItem[] } };
    const items = json.resultList?.result ?? [];

    return items.map((item) => ({
      id: item.id,
      source: item.source,
      pmid: item.pmid,
      doi: item.doi,
      title: item.title,
      authorString: item.authorString,
      pubYear: item.pubYear ? Number(item.pubYear) : undefined,
      isOpenAccess: item.isOpenAccess === 'Y',
      pubTypes: parsePubTypes(item),
    }));
  }

  async function fetchFullText(source: string, id: string): Promise<string | null> {
    const res = await fetchImpl(`${EUROPE_PMC_BASE}/${source}/${id}/fullTextXML`);
    if (res.status === 404) return null;
    if (!res.ok) {
      throw new Error(`Europe PMC fullTextXML failed: HTTP ${res.status}`);
    }
    const xml = await res.text();
    return extractReadableText(xml, 'application/xml');
  }

  return { search, fetchFullText };
}
