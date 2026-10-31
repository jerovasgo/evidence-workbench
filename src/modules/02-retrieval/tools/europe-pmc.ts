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
  /** A source-grounded fallback when open full text is unavailable. */
  fetchAbstract?(source: string, id: string): Promise<string | null>;
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
    let pmcid = source === 'PMC' ? id : undefined;
    if (!pmcid) {
      const params = new URLSearchParams({ query: `EXT_ID:${id} AND SRC:${source}`, format: 'json' });
      const lookup = await fetchImpl(`${EUROPE_PMC_BASE}/search?${params}`);
      if (!lookup.ok) return null;
      const record = await lookup.json() as { resultList?: { result?: { pmcid?: string }[] } };
      pmcid = record.resultList?.result?.[0]?.pmcid;
    }
    if (!pmcid || !/^PMC\d+$/.test(pmcid)) return null;
    try {
      const res = await fetchImpl(`${EUROPE_PMC_BASE}/${pmcid}/fullTextXML`);
      if (res.ok) {
        const xml = await res.text();
        return extractReadableText(xml, 'application/xml');
      }
    } catch {
      // The NCBI BioC endpoint below is a separate source for the same PMC record.
    }
    // Europe PMC occasionally returns 5xx for a PMC record that NCBI can serve.
    // BioC is limited to the OA/manuscript subset; failure remains null, not a
    // fabricated full text. Section labels and paragraph breaks remain visible.
    try {
      const res = await fetchImpl(`https://www.ncbi.nlm.nih.gov/research/bionlp/RESTful/pmcoa.cgi/bioc_json/${pmcid}/unicode`);
      if (!res.ok) return null;
      const body = await res.json() as { documents?: { passages?: { infons?: { section_type?: string }; text?: string }[] }[] }[];
      const passages = Array.isArray(body) ? body[0]?.documents?.[0]?.passages : undefined;
      if (!passages) return null;
      let lastSection = '';
      const parts: string[] = [];
      for (const passage of passages) {
        const section = passage.infons?.section_type ?? '';
        if (!passage.text?.trim() || ['TITLE', 'REF', 'SUPPL', 'FIG'].includes(section)) continue;
        if (section && section !== lastSection) parts.push(section);
        parts.push(passage.text.trim());
        lastSection = section;
      }
      return parts.length ? parts.join('\n\n') : null;
    } catch {
      return null;
    }
  }

  async function fetchAbstract(source: string, id: string): Promise<string | null> {
    const params = new URLSearchParams({ query: `EXT_ID:${id} AND SRC:${source}`, format: 'json', resultType: 'core', pageSize: '1' });
    const res = await fetchImpl(`${EUROPE_PMC_BASE}/search?${params}`);
    if (!res.ok) return null;
    const response = await res.json() as { resultList?: { result?: { abstractText?: string }[] } };
    const record = response.resultList?.result?.[0];
    if (!record?.abstractText?.trim()) return null;
    const text = extractReadableText(`<abstract>${record.abstractText}</abstract>`, 'application/xml').trim();
    return text ? `Abstract\n\n${text}` : null;
  }

  return { search, fetchFullText, fetchAbstract };
}
