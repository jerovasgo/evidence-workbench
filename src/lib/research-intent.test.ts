import { describe, expect, it } from 'vitest';
import { comparisonClarification, isComparisonRequest } from './research-intent';
describe('comparison clarification policy', () => {
  it.each(['Compara estos dos estudios', 'Compare these studies', 'Comparar', 'comparison'])('asks for missing objects: %s', (query) => expect(comparisonClarification(query)).not.toBeNull());
  it.each(['Compara estudios de expresión génica bajo hipoxia', 'Compare HIF1A and EPAS1', 'Compare PMID 123456 and PMID 234567', 'What is HIF1A?'])('does not block an actionable topic: %s', (query) => expect(comparisonClarification(query)).toBeNull());
  it('recognizes explicit comparison independently of the model router', () => expect(isComparisonRequest('Compara estudios de expresión génica bajo hipoxia')).toBe(true));
});
