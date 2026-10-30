import { describe, expect, it } from 'vitest';
import type { Claim, Passage } from '@/shared/domain';
import type { ExtractedClaim } from '../schemas/extraction';
import type { JudgeSupportOutput } from '../schemas/support-judge';
import { applySupportJudgment, verifyClaim } from './verify-claim';

const passages: Passage[] = [
  { id: 'p1', sourceId: 'src_1', locator: '¶1', text: 'Adding 50 mL of polar aprotic solvent to the SN2 reaction increased its rate.' },
];

function baseExtracted(overrides: Partial<ExtractedClaim> = {}): ExtractedClaim {
  return {
    text: 'Adding 50 mL of polar aprotic solvent increases the SN2 reaction rate.',
    basis: 'primary',
    actionType: 'finding',
    conditions: [],
    quote: 'Adding 50 mL of polar aprotic solvent to the SN2 reaction increased its rate.',
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
      expect(result.claim.verification).toEqual({ exists: false, quoteFound: true, quoteMatch: 'normalized_exact', retracted: false, support: 'unknown' });
      expect(result.claim.sourceId).toBe('src_1');
      expect(result.claim.grade).toEqual({ certainty: 'ungraded', origin: 'ai_estimated', nativeGrade: undefined });
    }
  });

  it('keeps only genetic context that appears in the cited quote', () => {
    const quote = 'In human cells, HIF1A expression increased under hypoxia.';
    const extracted = baseExtracted({ text: quote, quote, geneticContext: { gene: 'HIF1A', model: 'human cells', perturbation: 'hypoxia', organism: 'mouse', effect: 'increased' } });
    const result = verifyClaim({ extracted, sourceId: 'src_1', retracted: false }, [{ id: 'p1', sourceId: 'src_1', locator: 'p1', text: quote }]);
    expect(result.outcome).toBe('kept');
    if (result.outcome === 'kept') expect(result.claim.geneticContext).toEqual({ gene: 'HIF1A', model: 'human cells', perturbation: 'hypoxia', effect: 'increased' });
  });

  it('does not infer a short gene name from a substring of another entity', () => {
    const quote = 'Cas9 editing increased in human cells.';
    const extracted = baseExtracted({ text: quote, quote, geneticContext: { gene: 'Cas9', organism: 'human', model: 'cells', measurement: 'CA' } });
    const result = verifyClaim({ extracted, sourceId: 'src_1', retracted: false }, [{ id: 'p1', sourceId: 'src_1', locator: 'p1', text: quote }]);
    expect(result.outcome).toBe('kept');
    if (result.outcome === 'kept') expect(result.claim.geneticContext).toEqual({ gene: 'Cas9', organism: 'human', model: 'cells' });
  });

  it('maps a recognized printed certainty (module 04) onto the kept claim', () => {
    const result = verifyClaim(
      { extracted: baseExtracted({ nativeGrade: 'This is a well-established result in the field' }), sourceId: 'src_1', retracted: false },
      passages,
    );
    expect(result.outcome).toBe('kept');
    if (result.outcome === 'kept') {
      expect(result.claim.grade).toEqual({
        certainty: 'high',
        origin: 'source',
        nativeGrade: 'This is a well-established result in the field',
      });
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

  it('records when a located quotation needed bounded OCR tolerance', () => {
    const result = verifyClaim(
      { extracted: baseExtracted({ text: 'Adding 50 mL of polar aprotic solvent.', quote: 'Adding 50 mL of polar aprotic solvenl' }), sourceId: 'src_1', retracted: false },
      passages,
    );
    expect(result.outcome).toBe('kept');
    if (result.outcome === 'kept') expect(result.claim.verification.quoteMatch).toBe('ocr_fuzzy');
  });

  it('drops a claim from a retracted source even if the quote matches', () => {
    const result = verifyClaim({ extracted: baseExtracted(), sourceId: 'src_1', retracted: true }, passages);
    expect(result).toEqual({ outcome: 'dropped', reason: 'source is retracted or withdrawn' });
  });

  it("softens an unverified measurement to 'per local protocol' instead of dropping the claim", () => {
    const result = verifyClaim(
      {
        extracted: baseExtracted({ text: 'Adding 80 mL of polar aprotic solvent increases the SN2 reaction rate.' }), // 80 mL not in the quote (50 mL)
        sourceId: 'src_1',
        retracted: false,
      },
      passages,
    );
    expect(result.outcome).toBe('kept');
    if (result.outcome === 'kept') expect(result.claim.text).toBe('Adding per local protocol of polar aprotic solvent increases the SN2 reaction rate.');
  });

  it('drops a claim with a non-measurement number not present in the quote', () => {
    const result = verifyClaim(
      {
        extracted: baseExtracted({ text: 'Adding 50 mL of solvent over 90 minutes increases the SN2 reaction rate.' }), // "90 minutes" not in quote
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
          text: 'Handle with care, the reagent is toxic.',
          quote: 'This reagent is highly toxic and must be handled in a fume hood.',
          safetyCritical: false,
        }),
        sourceId: 'src_1',
        retracted: false,
      },
      [{ id: 'p1', sourceId: 'src_1', locator: '¶1', text: 'This reagent is highly toxic and must be handled in a fume hood.' }],
    );
    expect(result.outcome).toBe('kept');
    if (result.outcome === 'kept') expect(result.claim.safetyCritical).toBe(true);
  });
});

describe('applySupportJudgment', () => {
  const baseClaim: Claim = {
    id: 'c1',
    text: 'An SN2 reaction rate increases in a polar aprotic solvent.',
    basis: 'primary',
    actionType: 'finding',
    conditions: [],
    sourceId: 'src_1',
    passageId: 'p1',
    quote: 'Polar aprotic solvents accelerate SN2 reactions.',
    grade: { certainty: 'ungraded', origin: 'ai_estimated' },
    verification: { exists: true, quoteFound: true, retracted: false, support: 'unknown' },
    safetyCritical: false,
  };

  it('drops the claim when the judge says no', () => {
    const judgment: JudgeSupportOutput = { support: 'no', issues: ['negation'], note: 'Quote contradicts the claim.' };
    expect(applySupportJudgment(baseClaim, judgment)).toBeNull();
  });

  it('marks the claim supports with no issues when fully supported', () => {
    const judgment: JudgeSupportOutput = { support: 'supports', issues: [], note: 'Matches exactly.' };
    const result = applySupportJudgment(baseClaim, judgment);
    expect(result?.verification).toEqual({ exists: true, quoteFound: true, retracted: false, support: 'supports' });
  });

  it('keeps the claim as partial with a visible caveat (issues + note)', () => {
    const judgment: JudgeSupportOutput = { support: 'partial', issues: ['wrong_strength'], note: 'Quote says "may increase".' };
    const result = applySupportJudgment(baseClaim, judgment);
    expect(result?.verification.support).toBe('partial');
    expect(result?.verification.supportIssues).toEqual(['wrong_strength']);
    expect(result?.verification.supportNote).toBe('Quote says "may increase".');
  });

  it('keeps the claim as unknown when the judge could not decide', () => {
    const judgment: JudgeSupportOutput = { support: 'unknown', issues: [], note: 'Context insufficient.' };
    const result = applySupportJudgment(baseClaim, judgment);
    expect(result?.verification.support).toBe('unknown');
  });
});
