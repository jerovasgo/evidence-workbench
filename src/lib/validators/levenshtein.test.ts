import { describe, expect, it } from 'vitest';
import { levenshteinDistance } from './levenshtein.js';

describe('levenshteinDistance', () => {
  it('is 0 for identical strings', () => {
    expect(levenshteinDistance('aspirin', 'aspirin')).toBe(0);
  });

  it('counts a single substitution as distance 1', () => {
    expect(levenshteinDistance('aspirin', 'aspirln')).toBe(1);
  });

  it('counts insertions and deletions', () => {
    expect(levenshteinDistance('aspirin', 'asprin')).toBe(1);
    expect(levenshteinDistance('cat', 'cats')).toBe(1);
  });

  it('handles an empty string against a non-empty one', () => {
    expect(levenshteinDistance('', 'abc')).toBe(3);
    expect(levenshteinDistance('abc', '')).toBe(3);
  });
});
