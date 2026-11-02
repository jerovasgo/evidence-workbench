import { describe, expect, it } from 'vitest';
import { toBibTeX, toRis, type CitationSource } from './citation-export';

const fullSource: CitationSource = {
  id: 'europe_pmc:MED:42519825',
  title: 'A {real} paper \\ title',
  url: 'https://example.com/paper',
  doi: '10.1234/example',
  pmid: '42519825',
  year: 2024,
  issuer: 'Journal of Examples',
  firstAuthor: 'Smith, J.',
};

const minimalSource: CitationSource = {
  id: 'pubmed-1',
  title: 'A minimal source',
  url: 'https://example.com/minimal',
};

describe('toBibTeX', () => {
  it('includes every field for a fully-populated source', () => {
    const output = toBibTeX([fullSource]);
    expect(output).toContain('@article{europe_pmc_MED_42519825,');
    expect(output).toContain('author = {Smith, J. and others}');
    expect(output).toContain('journal = {Journal of Examples}');
    expect(output).toContain('year = {2024}');
    expect(output).toContain('doi = {10.1234/example}');
    expect(output).toContain('pmid = {42519825}');
    expect(output).toContain('url = {https://example.com/paper}');
  });

  it('escapes BibTeX special characters in the title', () => {
    expect(toBibTeX([fullSource])).toContain('title = {A \\{real\\} paper \\\\ title}');
  });

  it('omits fields the source does not have, never an empty placeholder', () => {
    const output = toBibTeX([minimalSource]);
    expect(output).not.toContain('author =');
    expect(output).not.toContain('journal =');
    expect(output).not.toContain('year =');
    expect(output).not.toContain('doi =');
    expect(output).not.toContain('pmid =');
    expect(output).toContain('title = {A minimal source}');
    expect(output).toContain('url = {https://example.com/minimal}');
  });

  it('produces a stable, unique citekey from the source id', () => {
    const first = toBibTeX([fullSource]);
    const second = toBibTeX([fullSource]);
    expect(first).toBe(second);
    expect(toBibTeX([fullSource, minimalSource])).toContain('@article{pubmed_1,');
  });
});

describe('toRis', () => {
  it('includes every field for a fully-populated source', () => {
    const output = toRis([fullSource]);
    expect(output).toContain('TY  - JOUR');
    expect(output).toContain('AU  - Smith, J.');
    expect(output).toContain('JO  - Journal of Examples');
    expect(output).toContain('PY  - 2024');
    expect(output).toContain('DO  - 10.1234/example');
    expect(output).toContain('AN  - 42519825');
    expect(output).toContain('UR  - https://example.com/paper');
    expect(output).toContain('ER  - ');
  });

  it('omits fields the source does not have', () => {
    const output = toRis([minimalSource]);
    expect(output).not.toContain('AU  -');
    expect(output).not.toContain('JO  -');
    expect(output).not.toContain('PY  -');
    expect(output).not.toContain('DO  -');
    expect(output).not.toContain('AN  -');
    expect(output).toContain('TI  - A minimal source');
  });
});
