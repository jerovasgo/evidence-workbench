import { describe, expect, it } from 'vitest';
import { buildSourceScore, computeDeterministicRelevance } from './source-score';

const relevanceContext = { query: 'HNF1A gene regulation', title: 'HNF1A gene regulation in human cells', snippet: 'Transcriptional targets were measured.' };

describe('buildSourceScore', () => {
  it('scores a current, applicable, high-quality standards-body publication near 1.0', () => {
    const breakdown = buildSourceScore(
      { kind: 'standards_body', publicationYear: new Date().getFullYear(), declaresConflictsOfInterest: true, hasExplicitMethods: true, appliesTo: { setting: 'in vitro cell culture' } },
      'in_vitro',
      relevanceContext,
    );
    expect(breakdown.relevance).toBeGreaterThan(0.8);
    expect(breakdown.level).toBeCloseTo(0.9, 5);
    expect(breakdown.quality).toBeCloseTo(1.0, 5);
    expect(breakdown.currency).toBeCloseTo(1.0, 5);
    expect(breakdown.applicability).toBeCloseTo(1.0, 5);
    expect(breakdown.applicabilityLabel).toBe('match');
    expect(breakdown.relevanceReason).toContain('HNF1A');
  });

  it('total is the product of the five factors, consistent with module 02s computeSourceScore', () => {
    const breakdown = buildSourceScore({ kind: 'observational_study', publicationYear: 2015, declaresConflictsOfInterest: false, appliesTo: { setting: 'in vivo animal model' } }, 'in_vitro', relevanceContext);
    const expectedTotal = breakdown.relevance * breakdown.level * breakdown.quality * breakdown.currency * breakdown.applicability;
    expect(breakdown.total).toBeCloseTo(expectedTotal, 5);
    expect(breakdown.applicabilityLabel).toBe('mismatch');
  });

  it('never penalizes currency for an ambiguous supersedesOrSupersededBy field (not passed in at all)', () => {
    const breakdown = buildSourceScore({ kind: 'standards_body', publicationYear: new Date().getFullYear() }, 'unknown', relevanceContext);
    expect(breakdown.currency).toBeCloseTo(1.0, 5);
  });

  it('falls back to partial applicability with no source setting text or an unknown run context', () => {
    const breakdown = buildSourceScore({ kind: 'controlled_experiment' }, 'unknown', relevanceContext);
    expect(breakdown.applicabilityLabel).toBe('partial');
    expect(breakdown.applicability).toBeCloseTo(0.8, 5);
  });

  it('caps a source that omits the named gene even when generic terms overlap', () => {
    const result = computeDeterministicRelevance({
      query: 'How does HNF1A regulate insulin expression?',
      title: 'Regulation of insulin expression under stress',
      snippet: 'A transcriptional mechanism was studied.',
    });
    expect(result.score).toBeLessThanOrEqual(0.3);
    expect(result.reason).toContain('No named genetic entity matched');
  });

  it('uses snippets as partial evidence and explains the matched terms', () => {
    const result = computeDeterministicRelevance({
      query: 'TP53 DNA damage response mechanism',
      title: 'A transcriptional response study',
      snippet: 'TP53 coordinates the DNA damage response pathway.',
    });
    expect(result.score).toBeGreaterThan(0.5);
    expect(result.reason).toContain('TP53');
  });
});
