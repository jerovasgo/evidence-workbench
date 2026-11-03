import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { assignEntitiesToFirstMention, GeneticEntityText } from './genetic-entity-text';

describe('GeneticEntityText', () => {
  it('links only exact verified entity mentions to the preferred reference', () => {
    const html = renderToStaticMarkup(createElement(GeneticEntityText, {
      text: 'HNF1A regulates targets; HNF1AX is different.',
      entities: [{
        symbol: 'HNF1A', kind: 'gene', links: [
          { label: 'NCBI Gene', url: 'https://www.ncbi.nlm.nih.gov/gene/6927' },
          { label: 'HGNC', url: 'https://www.genenames.org/data/gene-symbol-report/#!/hgnc_id/HGNC:11621' },
        ],
      }],
    }));
    expect(html).toContain('href="https://www.ncbi.nlm.nih.gov/gene/6927"');
    expect(html.match(/<a /g)).toHaveLength(1);
    expect(html).toContain('HNF1AX is different');
    expect(html).toContain('role="tooltip"');
    expect(html).toContain('HNF1A · NCBI Gene');
    expect(html).toContain('ncbi.nlm.nih.gov/gene/6927');
    expect(html).toContain('aria-describedby="entity-link-0-HNF1A"');
  });

  it('leaves text untouched when an entity has no verified reference', () => {
    expect(renderToStaticMarkup(createElement(GeneticEntityText, { text: 'ABC may be ambiguous.', entities: [] }))).toBe('ABC may be ambiguous.');
  });

  it('links only the first repeated mention of an entity in one block', () => {
    const html = renderToStaticMarkup(createElement(GeneticEntityText, {
      text: 'HNF1A regulates targets, while HNF1A also affects transcription.',
      entities: [{ symbol: 'HNF1A', kind: 'gene', links: [{ label: 'NCBI Gene', url: 'https://www.ncbi.nlm.nih.gov/gene/6927' }] }],
    }));
    expect(html.match(/<a /g)).toHaveLength(1);
    expect(html.match(/href="https:\/\/www\.ncbi\.nlm\.nih\.gov\/gene\/6927"/g)).toHaveLength(1);
  });

  it('assigns each entity only to the first response block where it appears', () => {
    const hnf1a = { symbol: 'HNF1A', kind: 'gene' as const, links: [{ label: 'NCBI Gene', url: 'https://www.ncbi.nlm.nih.gov/gene/6927' }] };
    const tp53 = { symbol: 'TP53', kind: 'gene' as const, links: [{ label: 'NCBI Gene', url: 'https://www.ncbi.nlm.nih.gov/gene/7157' }] };
    const assigned = assignEntitiesToFirstMention([
      { id: 'overview', text: 'HNF1A is relevant.' },
      { id: 'mechanism', text: 'HNF1A and TP53 interact in this account.' },
      { id: 'limitations', text: 'TP53 appears again.' },
    ], [hnf1a, tp53]);
    expect(assigned.overview).toEqual([hnf1a]);
    expect(assigned.mechanism).toEqual([tp53]);
    expect(assigned.limitations).toEqual([]);
  });
});
