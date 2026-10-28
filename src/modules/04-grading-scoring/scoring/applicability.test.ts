import { describe, expect, it } from 'vitest';
import { computeApplicability } from './applicability';

describe('computeApplicability', () => {
  it('returns partial when the run setting is unknown, regardless of source text', () => {
    expect(computeApplicability('Primary care clinic', 'unknown')).toBe('partial');
  });

  it('returns partial when the source has no setting text at all', () => {
    expect(computeApplicability(undefined, 'emergency')).toBe('partial');
  });

  it('returns match when the source text names the same setting as the run', () => {
    expect(computeApplicability('Set in the emergency department', 'emergency')).toBe('match');
    expect(computeApplicability('Primary care, ambulatory clinic', 'primary_care')).toBe('match');
  });

  it('returns mismatch when the source text names a clearly different known setting', () => {
    expect(computeApplicability('Inpatient hospital ward', 'emergency')).toBe('mismatch');
    expect(computeApplicability('Rural, low-resource settings', 'inpatient')).toBe('mismatch');
  });

  it('returns partial for unrecognized source setting wording', () => {
    expect(computeApplicability('Varies by country', 'emergency')).toBe('partial');
  });
});
