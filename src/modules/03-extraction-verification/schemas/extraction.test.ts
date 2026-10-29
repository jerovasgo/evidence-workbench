import { toStructuredOutputFormat } from '@/shared/agents';
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
          text: 'A polar aprotic solvent increases the SN2 reaction rate.',
          basis: 'primary' as const,
          actionType: 'finding' as const,
          conditions: [],
          quote: 'Polar aprotic solvents accelerate SN2 reactions.',
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

it('converts the genetic extraction schema within Meta structured-output limits', () => {
  expect(() => toStructuredOutputFormat('claims', ExtractClaimsOutputSchema)).not.toThrow();
});
