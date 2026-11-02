// 2026-11-02 (docs/DECISIONS.md): citation export for researchers citing this tool's
// output in a paper or grant — client-side only, built from data already streamed
// (`sourceCatalog`), no new network call. Never fabricates a field: an entry includes
// only what the source actually carries. Citekeys are the source's own sanitized `id`
// (deterministic, always unique) rather than a parsed-author guess, so this can never
// invent an author's surname from a possibly-incomplete `firstAuthor` string.

export interface CitationSource {
  id: string;
  title: string;
  url: string;
  doi?: string;
  pmid?: string;
  year?: number;
  issuer?: string;
  firstAuthor?: string;
}

function sanitizeCitekey(id: string): string {
  return id.replace(/[^a-zA-Z0-9]/g, '_');
}

function escapeBibTeX(value: string): string {
  return value.replace(/[{}\\]/g, (char) => `\\${char}`);
}

export function toBibTeX(sources: CitationSource[]): string {
  return sources
    .map((source) => {
      const fields: string[] = [`title = {${escapeBibTeX(source.title)}}`];
      if (source.firstAuthor) fields.push(`author = {${escapeBibTeX(source.firstAuthor)} and others}`);
      if (source.issuer) fields.push(`journal = {${escapeBibTeX(source.issuer)}}`);
      if (source.year) fields.push(`year = {${source.year}}`);
      if (source.doi) fields.push(`doi = {${source.doi}}`);
      if (source.pmid) fields.push(`pmid = {${source.pmid}}`);
      fields.push(`url = {${source.url}}`);
      return `@article{${sanitizeCitekey(source.id)},\n  ${fields.join(',\n  ')}\n}`;
    })
    .join('\n\n');
}

export function toRis(sources: CitationSource[]): string {
  return sources
    .map((source) => {
      const lines: string[] = ['TY  - JOUR', `TI  - ${source.title}`];
      if (source.firstAuthor) lines.push(`AU  - ${source.firstAuthor}`);
      if (source.issuer) lines.push(`JO  - ${source.issuer}`);
      if (source.year) lines.push(`PY  - ${source.year}`);
      if (source.doi) lines.push(`DO  - ${source.doi}`);
      if (source.pmid) lines.push(`AN  - ${source.pmid}`);
      lines.push(`UR  - ${source.url}`, 'ER  - ');
      return lines.join('\n');
    })
    .join('\n\n');
}
