import { describe, expect, it } from 'vitest';
import { computeCurrency, computeSourceScore } from './score';

describe('computeCurrency', () => {
  // Local-time constructor (not an ISO string) so this test is not sensitive to the
  // machine's timezone — "new Date('2026-01-01')" is parsed as UTC midnight, which
  // getFullYear() can read back as 2025 west of UTC.
  const now = new Date(2026, 0, 1);

  it('is 1.0 for a source 3 years old or newer', () => {
    expect(computeCurrency(2023, false, now)).toBe(1.0);
    expect(computeCurrency(2026, false, now)).toBe(1.0);
  });

  it('is 0.5 for a source 10 years old or older', () => {
    expect(computeCurrency(2016, false, now)).toBe(0.5);
    expect(computeCurrency(2000, false, now)).toBe(0.5);
  });

  it('decays linearly between 3 and 10 years', () => {
    // age 7y: 4/7 of the way from 3y(1.0) to 10y(0.5) -> 1 - 4/7*0.5 = 5/7
    expect(computeCurrency(2019, false, now)).toBeCloseTo(5 / 7, 5);
  });

  it('returns 0.2 when the source is superseded, regardless of year', () => {
    expect(computeCurrency(2026, true, now)).toBe(0.2);
  });

  it('returns 0.7 when the year is unknown', () => {
    expect(computeCurrency(undefined, false, now)).toBe(0.7);
  });
});

describe('computeSourceScore', () => {
  const now = new Date(2026, 0, 1);

  it('scores a current, applicable guideline near 1.0 when relevance and quality are high', () => {
    const score = computeSourceScore({
      relevance: 1,
      quality: 1,
      kind: 'guideline',
      year: 2025,
      isSuperseded: false,
      applicability: 'match',
      now,
    });
    expect(score).toBeCloseTo(1.0, 5);
  });

  it('scores an old observational study with a mismatched population much lower', () => {
    const score = computeSourceScore({
      relevance: 0.8,
      quality: 0.6,
      kind: 'observational',
      year: 2010,
      isSuperseded: false,
      applicability: 'mismatch',
      now,
    });
    // 0.8 * 0.45 * 0.6 * 0.5 (floor) * 0.6
    expect(score).toBeCloseTo(0.8 * 0.45 * 0.6 * 0.5 * 0.6, 5);
  });

  it('a superseded guideline scores lower than a current RCT despite the higher level weight', () => {
    const supersededGuideline = computeSourceScore({
      relevance: 1,
      quality: 1,
      kind: 'guideline',
      year: 2026,
      isSuperseded: true,
      applicability: 'match',
      now,
    });
    const currentRct = computeSourceScore({
      relevance: 1,
      quality: 1,
      kind: 'rct',
      year: 2026,
      isSuperseded: false,
      applicability: 'match',
      now,
    });
    expect(supersededGuideline).toBeLessThan(currentRct);
  });
});
