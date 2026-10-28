import { describe, expect, it } from 'vitest';
import { extractSurroundingContext } from './support-context';

describe('extractSurroundingContext', () => {
  it('includes the quote and surrounding text on both sides', () => {
    const passage = 'Before text. ' + 'x'.repeat(50) + ' The quick brown fox. ' + 'y'.repeat(50) + ' After text.';
    const context = extractSurroundingContext(passage, 'The quick brown fox.', 30);
    expect(context).toContain('the quick brown fox.'); // normalized to lowercase
    expect(context).toContain('x');
    expect(context).toContain('y');
  });

  it('clamps to the start of the passage when the quote is near the beginning', () => {
    const passage = 'The quick brown fox. ' + 'z'.repeat(2000);
    const context = extractSurroundingContext(passage, 'The quick brown fox.', 800);
    expect(context.startsWith('the quick brown fox.')).toBe(true);
  });

  it('clamps to the end of the passage when the quote is near the end', () => {
    const passage = 'a'.repeat(2000) + ' The quick brown fox.';
    const context = extractSurroundingContext(passage, 'The quick brown fox.', 800);
    expect(context.endsWith('the quick brown fox.')).toBe(true);
  });

  it('falls back to the start of the passage when the quote cannot be located', () => {
    const passage = 'Some unrelated passage text.';
    const context = extractSurroundingContext(passage, 'text that is nowhere in the passage', 100);
    expect(context).toContain('some unrelated passage text');
  });
});
