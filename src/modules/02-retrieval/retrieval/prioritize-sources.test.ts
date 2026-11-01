import { expect, it } from 'vitest';
import { assessRetrievalSufficiency, prioritizeSources } from './prioritize-sources';
it('ranks explicit topic matches and retains uncertain titles', () => {
 const sources = ['Unrelated observations', 'Gene expression under hypoxia'].map((title, i) => ({ tempId: `s${i}`, family: 'pubmed' as const, title, url: `https://example.org/${i}` }));
 const result = prioritizeSources('Compara estudios de expresión génica bajo hipoxia', sources);
 expect(result.map((entry) => entry.source.tempId)).toEqual(['s1', 's0']);
 expect(result[1]?.reason).toContain('uncertain');
});

it('distinguishes empty, off-topic, thin and sufficient retrieval for complex questions', () => {
 const query = 'What genes are most associated with drought tolerance in rice?';
 const relevant = (id: string, title: string, family: 'pubmed' | 'europe_pmc' = 'pubmed') => ({ tempId: id, family, title, url: `https://example.org/${id}` });
 expect(assessRetrievalSufficiency(query, []).status).toBe('empty');
 expect(assessRetrievalSufficiency(query, [relevant('x', 'Unrelated microscopy methods')]).status).toBe('off_topic');
 expect(assessRetrievalSufficiency(query, [relevant('one', 'GWAS loci for drought tolerance in rice')]).status).toBe('thin');
 expect(assessRetrievalSufficiency(query, [
  relevant('one', 'GWAS loci for drought tolerance in rice'),
  relevant('two', 'Genetic association with drought response in rice', 'europe_pmc'),
  relevant('three', 'Systematic review of genes controlling rice drought tolerance'),
 ]).status).toBe('sufficient');
});

it('2026-11-01 regression: the garbled "mo" term must not match as a substring inside "Hemoterapia" (docs/DECISIONS.md)', () => {
 // Reproduces the exact production failure: a broken tokenizer upstream once
 // produced "mo" as a query term for "¿Cómo funciona la PCR?"; a substring
 // check then matched it inside unrelated hematology-congress titles and
 // disguised an off-topic retrieval as "sufficient," so the real semantic
 // rescue (P3) never triggered. The upstream tokenizer is fixed (see
 // `seed-search-plan.test.ts`), but this is the second, independent half of
 // the fix: matching must be whole-word even if a bad term ever reaches here.
 const sources = [{ tempId: 'x', family: 'europe_pmc' as const, title: 'Congreso Nacional de Hematología y Hemoterapia', url: 'https://example.org/x' }];
 const result = prioritizeSources('mo funciona PCR', sources);
 expect(result[0]?.matched).toEqual([]);
 expect(assessRetrievalSufficiency('mo funciona PCR', sources).status).toBe('off_topic');
});

it('prioritizes association studies and reviews for a gene-ranking question without excluding other results', () => {
 const sources = [
  { tempId: 'generic', family: 'pubmed' as const, title: 'Essential hypertension overview', url: 'https://example.org/1' },
  { tempId: 'gwas', family: 'pubmed' as const, title: 'Genome-wide association study of genetic loci for essential hypertension', url: 'https://example.org/2' },
  { tempId: 'review', family: 'pubmed' as const, title: 'Genetic polymorphisms in hypertension: a systematic review', url: 'https://example.org/3' },
 ];
 const result = prioritizeSources('¿Cuáles son los genes más asociados con hipertensión primaria?', sources);
 expect(result.slice(0, 2).map((entry) => entry.source.tempId)).toEqual(['gwas', 'review']);
 expect(result).toHaveLength(3);
});
