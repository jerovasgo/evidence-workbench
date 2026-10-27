import { describe, expect, it } from 'vitest';
import { selectTopNWithDiversity, type ScoredCandidate } from './diversity-selection';

function c(item: string, score: number, issuer: string): ScoredCandidate<string> {
  return { item, score, issuer };
}

describe('selectTopNWithDiversity', () => {
  it('picks the top-N by score when issuers are already diverse', () => {
    const pool = [c('a', 0.9, 'AHA'), c('b', 0.8, 'IDSA'), c('c', 0.7, 'CDC'), c('d', 0.3, 'AHA')];
    expect(selectTopNWithDiversity(pool, 3)).toEqual(['a', 'b', 'c']);
  });

  it('enforces the per-issuer cap, pulling in a lower-scored other-issuer source instead', () => {
    const pool = [
      c('aha1', 0.95, 'AHA'),
      c('aha2', 0.9, 'AHA'),
      c('aha3', 0.85, 'AHA'),
      c('aha4', 0.8, 'AHA'), // would be 4th AHA source, over the cap of 3
      c('cdc1', 0.5, 'CDC'),
    ];
    const selected = selectTopNWithDiversity(pool, 4, { maxPerIssuer: 3 });
    expect(selected).toEqual(['aha1', 'aha2', 'aha3', 'cdc1']);
  });

  it('fills remaining slots over the cap rather than returning fewer than N when no other issuer exists', () => {
    const pool = [c('a', 0.9, 'AHA'), c('b', 0.8, 'AHA'), c('c', 0.7, 'AHA')];
    const selected = selectTopNWithDiversity(pool, 3, { maxPerIssuer: 2 });
    expect(selected).toHaveLength(3);
  });

  it('returns fewer than N only when the pool itself has fewer candidates than N', () => {
    const pool = [c('a', 0.9, 'AHA'), c('b', 0.8, 'CDC')];
    expect(selectTopNWithDiversity(pool, 5)).toHaveLength(2);
  });
});
