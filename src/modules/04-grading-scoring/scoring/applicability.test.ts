import { describe, expect, it } from 'vitest';
import { computeApplicability } from './applicability';

describe('computeApplicability', () => {
  it('returns partial when the run context is unknown, regardless of source text', () => {
    expect(computeApplicability('In vitro cell culture', 'unknown')).toBe('partial');
  });

  it('returns partial when the source has no setting text at all', () => {
    expect(computeApplicability(undefined, 'in_vitro')).toBe('partial');
  });

  it('returns match when the source text names the same context as the run', () => {
    expect(computeApplicability('Measured in cell culture', 'in_vitro')).toBe('match');
    expect(computeApplicability('A computational, simulation-based study', 'in_silico')).toBe('match');
  });

  it('returns mismatch when the source text names a clearly different known context', () => {
    expect(computeApplicability('An in vivo animal model', 'in_vitro')).toBe('mismatch');
    expect(computeApplicability('A theoretical derivation', 'field_study')).toBe('mismatch');
  });

  it('returns partial for unrecognized source setting wording', () => {
    expect(computeApplicability('Varies by lab', 'in_vitro')).toBe('partial');
  });
});
