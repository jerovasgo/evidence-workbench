import { describe, expect, it } from 'vitest';

import { buildSeedSearchPlan, detectQueryShape, extractSearchHints } from './seed-search-plan';



describe('deterministic seed search', () => {

  it.each([
    ['Top genes associated with drought tolerance', 'ranking'],
    ['Variants associated with Alzheimer disease', 'association'],
    ['Compara HIF1A y EPAS1', 'comparison'],
    ['¿Qué mecanismos relacionan la autofagia con el envejecimiento muscular?', 'mechanism'],
    ['Recent studies about CRISPR delivery', 'recency'],
    ['What is TP53?', 'general'],
  ] as const)('classifies query shape: %s', (question, expected) => {
    expect(detectQueryShape(question)).toBe(expected);
  });

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

    expect(plan.queries).toHaveLength(3);

    expect(plan.queries.every((query) => query.text.length > 0)).toBe(true);

  });

});



 it('focuses a Spanish hypoxia expression comparison on the topic rather than instruction words', () => {

   const plan = buildSeedSearchPlan('Compara estudios de expresi\u00f3n g\u00e9nica bajo hipoxia');

   expect(plan.queries[0]?.text).toContain('hypoxia');

   expect(plan.queries[0]?.text).toContain('gene expression');

   expect(plan.queries[1]?.text).toBe('gene expression hypoxia');

   expect(plan.queries.every((query) => !/\bcompara\b|\bestudios\b/i.test(query.text))).toBe(true);

 });


it('preserves a specific gene constraint rather than replacing it with the broad topic', () => {
  const plan = buildSeedSearchPlan('Compara estudios de expresión génica de HIF1A bajo hipoxia');
  expect(plan.queries.every((query) => query.text.includes('HIF1A'))).toBe(true);
});

it.each([
  '¿Cuáles son los cinco genes más asociados con hipertensión primaria?',
  'What genes are most associated with drought tolerance in rice?',
  'Principales variantes asociadas con enfermedad de Alzheimer',
])('expands ranking and association questions with association and synthesis facets: %s', (question) => {
  const plan = buildSeedSearchPlan(question);
  expect(plan.queries).toHaveLength(4);
  expect(plan.queries.some((query) => /GWAS/.test(query.text))).toBe(true);
  expect(plan.queries.some((query) => /review OR "meta-analysis" OR replication/.test(query.text))).toBe(true);
});
