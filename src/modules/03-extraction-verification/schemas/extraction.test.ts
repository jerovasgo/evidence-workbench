import { describe, expect, it } from 'vitest';
import { ExtractClaimsOutputSchema } from './extraction';

describe('ExtractClaimsOutputSchema', () => {
  it('accepts an empty claims array (passage has no recommendation)', () => {
    expect(() => ExtractClaimsOutputSchema.parse({ claims: [] })).not.toThrow();
  });

  it('accepts a well-formed extracted claim', () => {
    const output = {
      claims: [
        {
          text: 'Consider aspirin for suspected ACS.',
          basis: 'recommendation' as const,
          actionType: 'treat' as const,
          conditions: [],
          quote: 'Aspirin 325 mg should be given promptly.',
          passageId: 'p1',
          safetyCritical: false,
        },
      ],
    };
    expect(ExtractClaimsOutputSchema.parse(output)).toEqual(output);
  });

  it('rejects a claim with an unknown actionType', () => {
    const output = {
      claims: [
        {
          text: 'x',
          basis: 'recommendation',
          actionType: 'diagnose',
          conditions: [],
          quote: 'x',
          passageId: 'p1',
          safetyCritical: false,
        },
      ],
    };
    expect(() => ExtractClaimsOutputSchema.parse(output)).toThrow();
  });
});
