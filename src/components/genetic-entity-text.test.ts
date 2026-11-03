import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { GeneticEntityText } from './genetic-entity-text';

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
  });

  it('leaves text untouched when an entity has no verified reference', () => {
    expect(renderToStaticMarkup(createElement(GeneticEntityText, { text: 'ABC may be ambiguous.', entities: [] }))).toBe('ABC may be ambiguous.');
  });
});
