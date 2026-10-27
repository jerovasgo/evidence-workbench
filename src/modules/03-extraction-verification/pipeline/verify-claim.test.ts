import { describe, expect, it } from 'vitest';
import type { Passage } from '@/shared/domain';
import type { ExtractedClaim } from '../schemas/extraction';
import { verifyClaim } from './verify-claim';

const passages: Passage[] = [
  { id: 'p1', sourceId: 'src_1', locator: '¶1', text: 'Aspirin 325 mg should be given promptly in suspected ACS.' },
];

function baseExtracted(overrides: Partial<ExtractedClaim> = {}): ExtractedClaim {
  return {
    text: 'Give aspirin 325 mg for suspected ACS.',
    basis: 'recommendation',
    actionType: 'treat',
    conditions: [],
    quote: 'Aspirin 325 mg should be given promptly in suspected ACS.',
    passageId: 'p1',
    safetyCritical: false,
    ...overrides,
  };
}

describe('verifyClaim', () => {
  it('keeps a claim whose quote is found verbatim in its passage', () => {
    const result = verifyClaim({ extracted: baseExtracted(), sourceId: 'src_1', retracted: false }, passages);
    expect(result.outcome).toBe('kept');
    if (result.outcome === 'kept') {
      expect(result.claim.verification).toEqual({ exists: true, quoteFound: true, retracted: false, support: 'unknown' });
      expect(result.claim.sourceId).toBe('src_1');
      expect(result.claim.grade).toEqual({ certainty: 'ungraded', origin: 'ai_estimated', nativeGrade: undefined });
    }
  });

  it('drops a claim whose passageId does not match any passage', () => {
    const result = verifyClaim(
      { extracted: baseExtracted({ passageId: 'does-not-exist' }), sourceId: 'src_1', retracted: false },
      passages,
    );
    expect(result).toEqual({ outcome: 'dropped', reason: expect.stringContaining('does-not-exist') });
  });

  it('drops a claim whose quote does not appear verbatim in the passage', () => {
    const result = verifyClaim(
      { extracted: baseExtracted({ quote: 'This sentence is not in the passage at all.' }), sourceId: 'src_1', retracted: false },
      passages,
    );
    expect(result.outcome).toBe('dropped');
  });

  it('drops a claim from a retracted source even if the quote matches', () => {
    const result = verifyClaim({ extracted: baseExtracted(), sourceId: 'src_1', retracted: true }, passages);
    expect(result).toEqual({ outcome: 'dropped', reason: 'source is retracted or withdrawn' });
  });

  it("softens an unverified dose to 'per local protocol' instead of dropping the claim", () => {
    const result = verifyClaim(
      {
        extracted: baseExtracted({ text: 'Give aspirin 500 mg for suspected ACS.' }), // 500 mg not in the quote (325 mg)
        sourceId: 'src_1',
        retracted: false,
      },
      passages,
    );
    expect(result.outcome).toBe('kept');
    if (result.outcome === 'kept') expect(result.claim.text).toBe('Give aspirin per local protocol for suspected ACS.');
  });

  it('drops a claim with a non-dose number not present in the quote', () => {
    const result = verifyClaim(
      {
        extracted: baseExtracted({ text: 'Give aspirin 325 mg within 90 minutes for suspected ACS.' }), // "90 minutes" not in quote
        sourceId: 'src_1',
        retracted: false,
      },
      passages,
    );
    expect(result).toEqual({ outcome: 'dropped', reason: expect.stringContaining('90') });
  });

  it('raises safetyCritical from quote content even when the model proposed false', () => {
    const result = verifyClaim(
      {
        extracted: baseExtracted({
          text: 'Consider anticoagulation.',
          quote: 'Anticoagulation should be considered in all patients.',
          safetyCritical: false,
        }),
        sourceId: 'src_1',
        retracted: false,
      },
      [{ id: 'p1', sourceId: 'src_1', locator: '¶1', text: 'Anticoagulation should be considered in all patients.' }],
    );
    expect(result.outcome).toBe('kept');
    if (result.outcome === 'kept') expect(result.claim.safetyCritical).toBe(true);
  });
});
