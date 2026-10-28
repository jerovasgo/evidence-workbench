import { describe, expect, it } from 'vitest';
import { gradeClaim } from './grade-claim';

describe('gradeClaim', () => {
  it('returns ungraded/ai_estimated when there is no native grade at all', () => {
    expect(gradeClaim(undefined)).toEqual({ certainty: 'ungraded', origin: 'ai_estimated' });
  });

  it('maps a recognized native grade to the real certainty/strength, origin source', () => {
    expect(gradeClaim('Class I, LOE A')).toEqual({
      certainty: 'high',
      strength: { direction: 'for', level: 'strong' },
      origin: 'source',
      nativeGrade: 'Class I, LOE A',
    });
  });

  it('keeps the raw text and falls back to ungraded, origin still source, for an unrecognized scheme', () => {
    expect(gradeClaim('Local hospital protocol grade 2')).toEqual({
      certainty: 'ungraded',
      origin: 'source',
      nativeGrade: 'Local hospital protocol grade 2',
    });
  });

  it('omits strength when the mapped scheme does not carry one (e.g. Oxford CEBM)', () => {
    expect(gradeClaim('Oxford CEBM Level 2a')).toEqual({
      certainty: 'moderate',
      strength: undefined,
      origin: 'source',
      nativeGrade: 'Oxford CEBM Level 2a',
    });
  });
});
