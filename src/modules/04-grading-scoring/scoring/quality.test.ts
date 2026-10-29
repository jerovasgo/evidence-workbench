import { describe, expect, it } from 'vitest';
import { computeQuality } from './quality';

describe('computeQuality', () => {
  it('is 1.0 when every flag is unknown (absent)', () => {
    expect(computeQuality({ kind: 'controlled_experiment' })).toBe(1.0);
  });

  it('is 1.0 when flags are explicitly true', () => {
    expect(computeQuality({ kind: 'standards_body', declaresConflictsOfInterest: true, hasExplicitMethods: true })).toBe(1.0);
  });

  it('applies the 0.8 penalty only when declaresConflictsOfInterest is explicitly false', () => {
    expect(computeQuality({ kind: 'controlled_experiment', declaresConflictsOfInterest: false })).toBeCloseTo(0.8, 5);
  });

  it('applies the 0.85 penalty only for a standards-body publication with hasExplicitMethods explicitly false', () => {
    expect(computeQuality({ kind: 'standards_body', hasExplicitMethods: false })).toBeCloseTo(0.85, 5);
  });

  it('does not apply the methods penalty to a non-standards-body kind', () => {
    expect(computeQuality({ kind: 'controlled_experiment', hasExplicitMethods: false })).toBe(1.0);
  });

  it('stacks both penalties when both apply', () => {
    expect(computeQuality({ kind: 'standards_body', declaresConflictsOfInterest: false, hasExplicitMethods: false })).toBeCloseTo(0.8 * 0.85, 5);
  });
});
