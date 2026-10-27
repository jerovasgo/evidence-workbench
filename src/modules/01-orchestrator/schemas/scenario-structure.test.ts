import { describe, expect, it } from 'vitest';
import { ScenarioStructureSchema } from './scenario-structure';

describe('ScenarioStructureSchema', () => {
  it('accepts a minimal structure with no sub-questions or generic parameters', () => {
    const output = { setting: 'unknown' as const, subQuestions: [], genericParameters: {} };
    expect(() => ScenarioStructureSchema.parse(output)).not.toThrow();
  });

  it('accepts a fully populated structure', () => {
    const output = {
      population: 'adult with suspected acute coronary syndrome',
      setting: 'emergency' as const,
      subQuestions: ['first-line antiplatelet therapy', 'when to escalate to cath lab'],
      genericParameters: { ageGroup: 'adult', pregnancy: 'not pregnant', renalFunction: 'normal' },
    };
    expect(ScenarioStructureSchema.parse(output)).toEqual(output);
  });

  it('rejects more than 6 sub-questions', () => {
    const output = {
      setting: 'unknown' as const,
      subQuestions: Array.from({ length: 7 }, (_, i) => `q${i}`),
      genericParameters: {},
    };
    expect(() => ScenarioStructureSchema.parse(output)).toThrow();
  });

  it('rejects a setting outside the fixed enum', () => {
    const output = { setting: 'icu', subQuestions: [], genericParameters: {} };
    expect(() => ScenarioStructureSchema.parse(output)).toThrow();
  });
});
