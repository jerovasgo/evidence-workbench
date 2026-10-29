import { describe, expect, it } from 'vitest';
import { ScenarioStructureSchema } from './scenario-structure';

describe('ScenarioStructureSchema', () => {
  it('accepts a minimal structure with no sub-questions or scope parameters', () => {
    const output = { context: 'unknown' as const, subQuestions: [], scopeParameters: {} };
    expect(() => ScenarioStructureSchema.parse(output)).not.toThrow();
  });

  it('accepts a fully populated structure', () => {
    const output = {
      scope: 'SN2 reaction rate in polar aprotic solvents',
      context: 'in_vitro' as const,
      subQuestions: ['which solvents accelerate the reaction', 'what mechanism explains the rate increase'],
      scopeParameters: { system: 'alkyl halide + nucleophile', conditions: 'room temperature, inert atmosphere' },
    };
    expect(ScenarioStructureSchema.parse(output)).toEqual(output);
  });

  it('rejects more than 6 sub-questions', () => {
    const output = {
      context: 'unknown' as const,
      subQuestions: Array.from({ length: 7 }, (_, i) => `q${i}`),
      scopeParameters: {},
    };
    expect(() => ScenarioStructureSchema.parse(output)).toThrow();
  });

  it('rejects a context outside the fixed enum', () => {
    const output = { context: 'icu', subQuestions: [], scopeParameters: {} };
    expect(() => ScenarioStructureSchema.parse(output)).toThrow();
  });
});
