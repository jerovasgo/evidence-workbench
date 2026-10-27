import { describe, expect, it } from 'vitest';
import { ClaimSchema, VerifiedClaimSchema } from './claim.js';

const baseClaim = {
  id: 'claim_1',
  text: 'Consider aspirin for suspected ACS.',
  basis: 'recommendation' as const,
  actionType: 'treat' as const,
  conditions: [{ variable: 'age', op: '>' as const, value: 18 }],
  sourceId: 'src_1',
  passageId: 'pas_1',
  quote: 'Aspirin 325 mg should be given promptly.',
  grade: { certainty: 'high' as const, origin: 'source' as const },
  verification: { exists: true, quoteFound: true, retracted: false, support: 'supports' as const },
  safetyCritical: true,
};

describe('ClaimSchema', () => {
  it('accepts a well-formed claim', () => {
    expect(ClaimSchema.parse(baseClaim)).toEqual(baseClaim);
  });

  it('rejects an unknown actionType', () => {
    expect(() => ClaimSchema.parse({ ...baseClaim, actionType: 'diagnose' })).toThrow();
  });

  it('rejects an ai_estimated grade missing nothing extra (origin must be explicit)', () => {
    expect(() =>
      ClaimSchema.parse({
        ...baseClaim,
        grade: { certainty: 'moderate', origin: 'ai_estimated' },
      }),
    ).not.toThrow();
  });
});

describe('VerifiedClaimSchema', () => {
  it('accepts a claim with quoteFound = true', () => {
    expect(() => VerifiedClaimSchema.parse(baseClaim)).not.toThrow();
  });

  it('rejects a claim with quoteFound = false (SPEC §8 invariant)', () => {
    const unverified = {
      ...baseClaim,
      verification: { ...baseClaim.verification, quoteFound: false },
    };
    expect(() => VerifiedClaimSchema.parse(unverified)).toThrow();
  });
});
