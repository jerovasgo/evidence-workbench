import { describe, expect, it } from 'vitest';
import { JudgeSupportOutputSchema } from './support-judge';

describe('JudgeSupportOutputSchema', () => {
  it('accepts a well-formed supports verdict with no issues', () => {
    const output = { support: 'supports' as const, issues: [], note: 'Population, condition and action all match.' };
    expect(JudgeSupportOutputSchema.parse(output)).toEqual(output);
  });

  it('accepts a partial verdict with issues', () => {
    const output = { support: 'partial' as const, issues: ['wrong_strength' as const], note: 'Quote says "may be considered", claim says "recommended".' };
    expect(() => JudgeSupportOutputSchema.parse(output)).not.toThrow();
  });

  it('rejects an unknown issue value', () => {
    const output = { support: 'partial', issues: ['made_up_issue'], note: 'x' };
    expect(() => JudgeSupportOutputSchema.parse(output)).toThrow();
  });

  it('rejects a support value outside the fixed enum', () => {
    expect(() => JudgeSupportOutputSchema.parse({ support: 'strongly_supports', issues: [], note: 'x' })).toThrow();
  });
});
