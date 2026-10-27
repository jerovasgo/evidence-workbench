import { describe, expect, it } from 'vitest';
import { RouterOutputSchema } from './router';

describe('RouterOutputSchema', () => {
  it('accepts a minimal high-confidence algorithm intent', () => {
    const output = { intent: 'algorithm' as const, confidence: 'high' as const };
    expect(RouterOutputSchema.parse(output)).toEqual(output);
  });

  it('accepts out_of_scope with a reject reason', () => {
    const output = {
      intent: 'out_of_scope' as const,
      confidence: 'high' as const,
      reject: { reason: 'Asks for patient-specific dosing advice for a named patient.' },
    };
    expect(() => RouterOutputSchema.parse(output)).not.toThrow();
  });

  it('accepts a mixed request with a secondary intent', () => {
    const output = { intent: 'fact_lookup' as const, secondary: 'comparison' as const, confidence: 'medium' as const };
    expect(() => RouterOutputSchema.parse(output)).not.toThrow();
  });

  it('rejects an intent outside the module 01 set (e.g. the older P1 draft\'s "explainer")', () => {
    expect(() => RouterOutputSchema.parse({ intent: 'explainer', confidence: 'high' })).toThrow();
  });
});
