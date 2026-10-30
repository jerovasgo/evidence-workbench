// Curated hosts for supplemental genetic context and open scientific literature.
// This allow-list permits URL fetching; reference records are not primary studies.

export interface AllowedDomain {
  domain: string;
  reason: string;
}

export const DEFAULT_ALLOWED_DOMAINS: readonly AllowedDomain[] = [
  { domain: 'ncbi.nlm.nih.gov', reason: 'NCBI Gene, PubMed, PMC and Bookshelf — gene records and primary literature' },
  { domain: 'ebi.ac.uk', reason: 'EMBL-EBI Europe PMC and biological data resources' },
  { domain: 'ensembl.org', reason: 'Ensembl — genome annotation and gene identifiers' },
  { domain: 'genenames.org', reason: 'HGNC — curated human gene symbols and aliases' },
  { domain: 'uniprot.org', reason: 'UniProt — curated protein annotations' },
  { domain: 'reactome.org', reason: 'Reactome — curated molecular pathways' },
  { domain: 'orpha.net', reason: 'Orphanet — rare disease and gene association context when relevant' },
  { domain: 'orphanet.net', reason: 'Orphanet legacy resource links when relevant' },
];

export const DEFAULT_ALLOWED_DOMAIN_NAMES: readonly string[] = DEFAULT_ALLOWED_DOMAINS.map((d) => d.domain);
