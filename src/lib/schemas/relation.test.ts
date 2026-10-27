import { describe, expect, it } from 'vitest';
import { RelationSchema } from './relation.js';

describe('RelationSchema', () => {
  it('accepts a plain agreement relation with no divergence', () => {
    const relation = {
      from: 'claim_1',
      to: 'claim_2',
      kind: 'agrees' as const,
      evidence: 'Both quotes recommend the same threshold.',
    };
    expect(RelationSchema.parse(relation)).toEqual(relation);
  });

  it('accepts a safety-critical divergence requiring clinician decision', () => {
    const relation = {
      from: 'local_claim_1',
      to: 'claim_2',
      kind: 'contradicts' as const,
      evidence: 'Local protocol sets 500mg; external guideline sets 325mg.',
      divergence: {
        kind: 'clinical_contradiction' as const,
        requiresClinicianDecision: true,
        suggested: 'none' as const,
        rationale: ['Dose differs by more than 50%'],
      },
    };
    expect(() => RelationSchema.parse(relation)).not.toThrow();
  });
});
