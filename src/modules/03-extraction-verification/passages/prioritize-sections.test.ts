import { expect, it } from 'vitest';
import { prioritizeSections, selectDeepReadingPassages } from './prioritize-sections';
const passages = ['Abstract', 'Methods', 'Results', 'Discussion'].map((heading, i) => ({ id: `p${i}`, sourceId: 's', locator: `paragraph ${i}`, text: `${heading}\n\nStudy text.` }));
it('prioritizes findings without losing provenance or omitting sections', () => {
 const result = prioritizeSections(passages, 'gene expression findings');
 expect(result.map((entry) => entry.audit.section)).toEqual(['results', 'discussion', 'abstract', 'methods']);
 expect(result.map((entry) => entry.passage.id).sort()).toEqual(passages.map((entry) => entry.id));
 expect(result.every((entry) => entry.audit.status === 'pending')).toBe(true);
});
it('prioritizes methods for an explicit protocol question', () => expect(prioritizeSections(passages, 'Compare protocols and methods')[0]?.audit.section).toBe('methods'));
it('prioritizes discussion for interpretation', () => expect(prioritizeSections(passages, 'interpret limitations')[0]?.audit.section).toBe('discussion'));
it('keeps a section-balanced deep set and leaves the rest traceable', () => {
 const many = [
  ...Array.from({ length: 8 }, (_, i) => ({ id: `r${i}`, sourceId: 's', locator: `r${i}`, text: `${i === 0 ? 'Results\n\n' : ''}result ${i}` })),
  ...Array.from({ length: 5 }, (_, i) => ({ id: `d${i}`, sourceId: 's', locator: `d${i}`, text: `${i === 0 ? 'Discussion\n\n' : ''}discussion ${i}` })),
 ];
 const prioritized = prioritizeSections(many, 'gene expression findings');
 const selected = selectDeepReadingPassages(prioritized);
 expect(selected).toHaveLength(6);
 expect(selected.filter((entry) => entry.audit.section === 'results')).toHaveLength(3);
 expect(selected.filter((entry) => entry.audit.section === 'discussion')).toHaveLength(3);
 expect(prioritized).toHaveLength(13);
});
