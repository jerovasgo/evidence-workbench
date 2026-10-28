import { describe, expect, it } from 'vitest';
import { computeQuality } from './quality';

describe('computeQuality', () => {
  it('is 1.0 when every flag is unknown (absent)', () => {
    expect(computeQuality({ kind: 'rct' })).toBe(1.0);
  });

  it('is 1.0 when flags are explicitly true', () => {
    expect(computeQuality({ kind: 'guideline', declaresConflictsOfInterest: true, hasExplicitMethods: true })).toBe(1.0);
  });

  it('applies the 0.8 penalty only when declaresConflictsOfInterest is explicitly false', () => {
    expect(computeQuality({ kind: 'rct', declaresConflictsOfInterest: false })).toBeCloseTo(0.8, 5);
  });

  it('applies the 0.85 penalty only for a guideline with hasExplicitMethods explicitly false', () => {
    expect(computeQuality({ kind: 'guideline', hasExplicitMethods: false })).toBeCloseTo(0.85, 5);
  });

  it('does not apply the methods penalty to a non-guideline kind', () => {
    expect(computeQuality({ kind: 'rct', hasExplicitMethods: false })).toBe(1.0);
  });

  it('stacks both penalties when both apply', () => {
    expect(computeQuality({ kind: 'guideline', declaresConflictsOfInterest: false, hasExplicitMethods: false })).toBeCloseTo(0.8 * 0.85, 5);
  });
});
