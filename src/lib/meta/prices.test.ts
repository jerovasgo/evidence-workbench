import { describe, expect, it } from 'vitest';
import { estimateCostUsd } from './prices';

describe('estimateCostUsd', () => {
  it('computes cost for muse-spark-1.3 with no cache hit', () => {
    const cost = estimateCostUsd('muse-spark-1.3', {
      inputTokens: 1_000_000,
      cachedInputTokens: 0,
      outputTokens: 1_000_000,
    });
    expect(cost).toBeCloseTo(1.25 + 4.25, 6);
  });

  it('applies the cached-input rate only to the cached portion', () => {
    const cost = estimateCostUsd('muse-spark-1.3', {
      inputTokens: 1_000_000,
      cachedInputTokens: 1_000_000,
      outputTokens: 0,
    });
    expect(cost).toBeCloseTo(0.15, 6);
  });

  it('adds search grounding cost at $2.50 per 1,000 queries', () => {
    const cost = estimateCostUsd(
      'muse-spark-1.3',
      { inputTokens: 0, cachedInputTokens: 0, outputTokens: 0 },
      1000,
    );
    expect(cost).toBeCloseTo(2.5, 6);
  });

  it('throws for a model with no price table entry', () => {
    expect(() =>
      estimateCostUsd('sam-3.1', { inputTokens: 1, cachedInputTokens: 0, outputTokens: 1 }),
    ).toThrow(/no price table entry/);
  });
});
