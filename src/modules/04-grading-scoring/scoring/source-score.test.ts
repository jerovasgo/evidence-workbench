import { describe, expect, it } from 'vitest';
import { buildSourceScore } from './source-score';

describe('buildSourceScore', () => {
  it('scores a current, applicable, high-quality standards-body publication near 1.0', () => {
    const breakdown = buildSourceScore(
      { kind: 'standards_body', publicationYear: new Date().getFullYear(), declaresConflictsOfInterest: true, hasExplicitMethods: true, appliesTo: { setting: 'in vitro cell culture' } },
      'in_vitro',
    );
    expect(breakdown.relevance).toBe(1.0);
    expect(breakdown.level).toBeCloseTo(0.9, 5);
    expect(breakdown.quality).toBeCloseTo(1.0, 5);
    expect(breakdown.currency).toBeCloseTo(1.0, 5);
    expect(breakdown.applicability).toBeCloseTo(1.0, 5);
    expect(breakdown.applicabilityLabel).toBe('match');
    expect(breakdown.total).toBeCloseTo(0.9, 5);
  });

  it('total is the product of the five factors, consistent with module 02s computeSourceScore', () => {
    const breakdown = buildSourceScore({ kind: 'observational_study', publicationYear: 2015, declaresConflictsOfInterest: false, appliesTo: { setting: 'in vivo animal model' } }, 'in_vitro');
    const expectedTotal = breakdown.relevance * breakdown.level * breakdown.quality * breakdown.currency * breakdown.applicability;
    expect(breakdown.total).toBeCloseTo(expectedTotal, 5);
    expect(breakdown.applicabilityLabel).toBe('mismatch');
  });

  it('never penalizes currency for an ambiguous supersedesOrSupersededBy field (not passed in at all)', () => {
    const breakdown = buildSourceScore({ kind: 'standards_body', publicationYear: new Date().getFullYear() }, 'unknown');
    expect(breakdown.currency).toBeCloseTo(1.0, 5);
  });

  it('falls back to partial applicability with no source setting text or an unknown run context', () => {
    const breakdown = buildSourceScore({ kind: 'controlled_experiment' }, 'unknown');
    expect(breakdown.applicabilityLabel).toBe('partial');
    expect(breakdown.applicability).toBeCloseTo(0.8, 5);
  });
});
