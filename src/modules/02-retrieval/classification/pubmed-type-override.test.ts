import { describe, expect, it } from 'vitest';
import type { SourceClassification } from '../schemas/classification';
import { applyPubmedTypeOverride } from './pubmed-type-override';

function classification(kind: SourceClassification['kind']): SourceClassification {
  return { sourceId: 's1', kind, isScientific: true, confidence: 'medium' };
}

describe('applyPubmedTypeOverride', () => {
  it('forces kind to guideline when PubMed pubTypes includes "Practice Guideline"', () => {
    const result = applyPubmedTypeOverride(classification('other'), ['Journal Article', 'Practice Guideline']);
    expect(result.kind).toBe('guideline');
  });

  it('forces kind to systematic_review for "Systematic Review" or "Meta-Analysis"', () => {
    expect(applyPubmedTypeOverride(classification('rct'), ['Systematic Review']).kind).toBe('systematic_review');
    expect(applyPubmedTypeOverride(classification('rct'), ['Meta-Analysis']).kind).toBe('systematic_review');
  });

  it('forces kind to rct for "Randomized Controlled Trial"', () => {
    expect(applyPubmedTypeOverride(classification('observational'), ['Randomized Controlled Trial']).kind).toBe('rct');
  });

  it('leaves kind untouched when no PubMed pubType is decisive', () => {
    const original = classification('observational');
    expect(applyPubmedTypeOverride(original, ['Journal Article', 'Comment'])).toEqual(original);
  });

  it('leaves kind untouched when the model already agrees with the decisive type', () => {
    const original = classification('guideline');
    const result = applyPubmedTypeOverride(original, ['Practice Guideline']);
    expect(result).toEqual(original);
  });

  it('is case-insensitive when matching pubTypes', () => {
    expect(applyPubmedTypeOverride(classification('other'), ['PRACTICE GUIDELINE']).kind).toBe('guideline');
  });
});
