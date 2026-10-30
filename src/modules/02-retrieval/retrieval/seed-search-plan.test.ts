import { describe, expect, it } from 'vitest';
import { buildSeedSearchPlan, extractSearchHints } from './seed-search-plan';

describe('deterministic seed search', () => {
  it('retains explicit gene-like terms and named studies without inventing either', () => {
    const hints = extractSearchHints('What did Jinek 2012 and Cong 2013 show about CRISPR-Cas9 and TP53?');
    expect(hints.geneLike).toContain('TP53');
    expect(hints.namedStudies).toEqual([{ author: 'Jinek', year: '2012' }, { author: 'Cong', year: '2013' }]);
    const plan = buildSeedSearchPlan('What did Jinek 2012 and Cong 2013 show about CRISPR-Cas9 and TP53?');
    expect(plan.queries.slice(0, 2).map((query) => query.text)).toEqual(['Jinek 2012 CRISPR-Cas9', 'Cong 2013 CRISPR-Cas9']);
    expect(plan.queries.map((query) => query.family)).toEqual(['europe_pmc', 'europe_pmc', 'pubmed', 'europe_pmc']);
  });

  it('searches both indexes even without a recognizable gene or named study', () => {
    const plan = buildSeedSearchPlan('How does horizontal gene transfer occur?');
    expect(plan.queries).toHaveLength(2);
    expect(plan.queries.every((query) => query.text.length > 0)).toBe(true);
  });
});
