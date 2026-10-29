import { describe, expect, it } from 'vitest';
import { RelationSchema } from './relation';

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

  it('accepts a safety-critical divergence requiring expert review', () => {
    const relation = {
      from: 'local_claim_1',
      to: 'claim_2',
      kind: 'contradicts' as const,
      evidence: 'Local protocol uses 500mL; published method uses 325mL.',
      divergence: {
        kind: 'scientific_contradiction' as const,
        requiresExpertReview: true,
        suggested: 'none' as const,
        rationale: ['Volume differs by more than 50%'],
      },
    };
    expect(() => RelationSchema.parse(relation)).not.toThrow();
  });
});
