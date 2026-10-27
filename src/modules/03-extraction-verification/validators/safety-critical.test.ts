import { describe, expect, it } from 'vitest';
import { applySafetyCriticalRule, detectSafetyCritical } from './safety-critical';

describe('detectSafetyCritical', () => {
  it.each([
    'Start therapeutic anticoagulation with heparin.',
    'Administer thrombolysis within the window.',
    'Adjust the insulin infusion rate.',
    'Taper the opioid dose slowly.',
    'Use weight-based pediatric dosing.',
    'Contraindicated in renal failure.',
    'Do not give aspirin if allergic.',
  ])('flags: %s', (text) => {
    expect(detectSafetyCritical(text)).toBe(true);
  });

  it('does not flag an ordinary, non-safety-critical statement', () => {
    expect(detectSafetyCritical('Consider ordering a chest X-ray.')).toBe(false);
  });
});

describe('applySafetyCriticalRule', () => {
  it('keeps the model-proposed true even when the text has no matching keyword', () => {
    expect(applySafetyCriticalRule(true, 'Routine follow-up in two weeks.')).toBe(true);
  });

  it('raises a model-proposed false to true when the text matches a safety-critical keyword', () => {
    expect(applySafetyCriticalRule(false, 'Begin anticoagulation immediately.')).toBe(true);
  });

  it('leaves false as false when neither the model nor the text indicates safety-critical', () => {
    expect(applySafetyCriticalRule(false, 'Schedule a routine follow-up visit.')).toBe(false);
  });
});
