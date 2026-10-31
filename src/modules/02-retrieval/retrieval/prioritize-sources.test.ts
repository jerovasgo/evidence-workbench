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
