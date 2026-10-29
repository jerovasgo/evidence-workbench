import { describe, expect, it } from 'vitest';
import { applySafetyCriticalRule, detectSafetyCritical } from './safety-critical';

describe('detectSafetyCritical', () => {
  it.each([
    'This reagent is explosive when heated.',
    'The solvent is highly toxic if inhaled.',
    'This acid is corrosive to skin and eyes.',
    'The vapor is flammable near an open flame.',
    'This compound is a known carcinogen.',
    'The reagent is a mutagen in standard assays.',
    'The sample remains radioactive for several half-lives.',
    'This sample is a biohazard and must be sealed.',
    'The culture is pathogenic to humans.',
    'This strain is infectious at low doses.',
    'The dose used in this study was lethal to the test organism.',
    'A fatal reaction can occur if these are combined.',
    'Do not mix this reagent with strong oxidizers.',
  ])('flags: %s', (text) => {
    expect(detectSafetyCritical(text)).toBe(true);
  });

  it('does not flag an ordinary, non-hazardous statement', () => {
    expect(detectSafetyCritical('Consider repeating the measurement at a lower temperature.')).toBe(false);
  });
});

describe('applySafetyCriticalRule', () => {
  it('keeps the model-proposed true even when the text has no matching keyword', () => {
    expect(applySafetyCriticalRule(true, 'Routine measurement, repeated twice.')).toBe(true);
  });

  it('raises a model-proposed false to true when the text matches a safety-critical keyword', () => {
    expect(applySafetyCriticalRule(false, 'This reagent is highly toxic.')).toBe(true);
  });

  it('leaves false as false when neither the model nor the text indicates safety-critical', () => {
    expect(applySafetyCriticalRule(false, 'Schedule a routine recalibration of the instrument.')).toBe(false);
  });
});
