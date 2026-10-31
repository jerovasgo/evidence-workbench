import { describe, expect, it } from 'vitest';
import { evaluateExtraction, evaluateSupportJudge } from './genetic-extraction';

describe('genetic extraction evaluation', () => {
  it('counts duplicates and irrelevant claims as false positives and reports drop reasons', () => {
    const result = evaluateExtraction(['g1', 'g2'], [
      { claimId: 'c1', matchedGoldId: 'g1', relevant: true },
      { claimId: 'c2', matchedGoldId: 'g1', relevant: true },
      { claimId: 'c3', matchedGoldId: null, relevant: false },
    ], ['quote not found', 'quote not found']);
    expect(result).toMatchObject({ precision: 1 / 3, recall: 1 / 2, truePositive: 1, falsePositive: 2, falseNegative: 1, dropReasons: { 'quote not found': 2 } });
  });

  it('computes agreement and kappa against human labels', () => {
    const result = evaluateSupportJudge([
      { claimId: 'a', human: 'supports', judge: 'supports' },
      { claimId: 'b', human: 'supports', judge: 'partial' },
      { claimId: 'c', human: 'partial', judge: 'partial' },
      { claimId: 'd', human: 'no', judge: 'no' },
    ]);
    expect(result.agreement).toBe(0.75);
    expect(result.kappa).toBeCloseTo(0.63636, 4);
    expect(result.confusion.supports.partial).toBe(1);
  });
});
