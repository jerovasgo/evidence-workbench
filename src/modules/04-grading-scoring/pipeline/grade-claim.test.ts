import { describe, expect, it } from 'vitest';
import { gradeClaim } from './grade-claim';

describe('gradeClaim', () => {
  it('returns ungraded/ai_estimated when there is no native grade at all', () => {
    expect(gradeClaim(undefined)).toEqual({ certainty: 'ungraded', origin: 'ai_estimated' });
  });

  it('maps recognized certainty language to the real certainty, origin source', () => {
    expect(gradeClaim('This is a well-established result in the field')).toEqual({
      certainty: 'high',
      origin: 'source',
      nativeGrade: 'This is a well-established result in the field',
    });
  });

  it('keeps the raw text and falls back to ungraded, origin still source, for unrecognized phrasing', () => {
    expect(gradeClaim('Local lab protocol, internal grade 2')).toEqual({
      certainty: 'ungraded',
      origin: 'source',
      nativeGrade: 'Local lab protocol, internal grade 2',
    });
  });

  it('maps a disputed/controversial result to very_low certainty', () => {
    expect(gradeClaim('This result remains disputed among experts')).toEqual({
      certainty: 'very_low',
      origin: 'source',
      nativeGrade: 'This result remains disputed among experts',
    });
  });
});
