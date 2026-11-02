import { describe, expect, it } from 'vitest';
import { passageStatusLabel, sourceReviewStatusLabel } from './review-status-labels';

describe('sourceReviewStatusLabel', () => {
  it('maps every known status to a plain-language label', () => {
    expect(sourceReviewStatusLabel('ok')).toBe('Evaluated');
    expect(sourceReviewStatusLabel('no_full_text')).toBe('Could not access full text');
    expect(sourceReviewStatusLabel('extraction_failed')).toBe('Extraction failed');
    expect(sourceReviewStatusLabel('pending')).toBe('Pending evaluation');
  });

  it('falls back gracefully for an unrecognized or empty status', () => {
    expect(sourceReviewStatusLabel('mystery')).toBe('Mystery');
    expect(sourceReviewStatusLabel('')).toBe('Not yet started');
  });
});

describe('passageStatusLabel', () => {
  it('maps every known passage status to a plain-language label', () => {
    expect(passageStatusLabel('pending')).toBe('Not yet reached');
    expect(passageStatusLabel('reviewed')).toBe('Reviewed');
    expect(passageStatusLabel('unreviewed')).toBe('Not reviewed');
  });
});
