import { describe, expect, it, vi } from 'vitest';
import { lookupGeneContext } from './gene-context';

describe('lookupGeneContext', () => {
  it('looks up an explicit gene in HGNC and NCBI without treating it as a study', async () => {
    const fetchImpl = vi.fn(async (url: string) => new Response(JSON.stringify(url.includes('genenames')
      ? { response: { docs: [{ symbol: 'HNF1A', name: 'HNF1 homeobox A', hgnc_id: 'HGNC:11621', entrez_id: '6927', ensembl_gene_id: 'ENSG00000135100' }] } }
      : { esearchresult: { idlist: ['6927'] } }), { status: 200 })) as unknown as typeof fetch;
    const result = await lookupGeneContext('What does HNF1A regulate?', fetchImpl);
    expect(result[0]).toMatchObject({ symbol: 'HNF1A', kind: 'gene', name: 'HNF1 homeobox A', geneId: '6927' });
    expect(result[0]?.links.map((link) => link.label)).toEqual(['NCBI Gene', 'HGNC', 'Ensembl']);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('links an explicit, verified UniProt accession as a protein', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      primaryAccession: 'P69905',
      proteinDescription: { recommendedName: { fullName: { value: 'Hemoglobin subunit alpha' } } },
    }), { status: 200 })) as unknown as typeof fetch;
    const result = await lookupGeneContext('What is known about P69905?', fetchImpl);
    expect(result).toEqual([{ symbol: 'P69905', kind: 'protein', name: 'Hemoglobin subunit alpha', links: [{ label: 'UniProt', url: 'https://www.uniprot.org/uniprotkb/P69905/entry' }] }]);
  });

  it('does not call reference APIs without an explicit gene-like token', async () => {
    const fetchImpl = vi.fn() as unknown as typeof fetch;
    expect(await lookupGeneContext('How does horizontal gene transfer work?', fetchImpl)).toEqual([]);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
