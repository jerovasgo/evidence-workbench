import { extractSearchHints } from '../retrieval/seed-search-plan';

export interface GeneContext {
  symbol: string;
  name?: string;
  summary?: string;
  geneId?: string;
  hgncId?: string;
  links: { label: string; url: string }[];
}

const cache = new Map<string, { expires: number; value: GeneContext[] }>();
const TTL_MS = 24 * 60 * 60 * 1000;

async function getJson(url: string, headers: HeadersInit, fetchImpl: typeof fetch): Promise<unknown> {
  const response = await fetchImpl(url, { headers, signal: AbortSignal.timeout(2500) });
  if (!response.ok) throw new Error(`Gene context HTTP ${response.status}`);
  return response.json();
}

/** Fast, optional reference lookup. Its records supply context, never evidence claims. */
export async function lookupGeneContext(question: string, fetchImpl: typeof fetch = fetch): Promise<GeneContext[]> {
  const symbols = extractSearchHints(question).geneLike.slice(0, 2).map((s) => s.toUpperCase());
  if (!symbols.length) return [];
  const key = symbols.join(',');
  const cached = cache.get(key);
  if (cached && cached.expires > Date.now()) return cached.value;

  const results = await Promise.all(symbols.map(async (symbol): Promise<GeneContext> => {
    const links = [
      { label: 'NCBI Gene', url: `https://www.ncbi.nlm.nih.gov/gene/?term=${encodeURIComponent(symbol)}` },
      { label: 'HGNC', url: `https://www.genenames.org/tools/search/#!/?query=${encodeURIComponent(symbol)}` },
    ];
    const [hgnc, ncbi] = await Promise.allSettled([
      getJson(`https://rest.genenames.org/fetch/symbol/${encodeURIComponent(symbol)}`, { Accept: 'application/json' }, fetchImpl),
      getJson(`https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=gene&term=${encodeURIComponent(`${symbol}[sym] AND Homo sapiens[orgn]`)}&retmode=json&retmax=1`, { Accept: 'application/json' }, fetchImpl),
    ]);
    const doc = hgnc.status === 'fulfilled' ? (hgnc.value as { response?: { docs?: { symbol?: string; name?: string; hgnc_id?: string; entrez_id?: string; ensembl_gene_id?: string }[] } }).response?.docs?.[0] : undefined;
    const ncbiId = ncbi.status === 'fulfilled' ? (ncbi.value as { esearchresult?: { idlist?: string[] } }).esearchresult?.idlist?.[0] : undefined;
    const geneId = doc?.entrez_id || ncbiId;
    if (geneId) links[0] = { label: 'NCBI Gene', url: `https://www.ncbi.nlm.nih.gov/gene/${encodeURIComponent(geneId)}` };
    if (doc?.ensembl_gene_id) links.push({ label: 'Ensembl', url: `https://www.ensembl.org/Homo_sapiens/Gene/Summary?g=${encodeURIComponent(doc.ensembl_gene_id)}` });
    return { symbol, name: doc?.name, geneId, hgncId: doc?.hgnc_id, links };
  }));
  cache.set(key, { expires: Date.now() + TTL_MS, value: results });
  return results;
}
