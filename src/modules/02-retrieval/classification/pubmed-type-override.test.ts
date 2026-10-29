import { describe, expect, it } from 'vitest';
import type { SourceClassification } from '../schemas/classification';
import { applyPubmedTypeOverride } from './pubmed-type-override';

function classification(kind: SourceClassification['kind']): SourceClassification {
  return { sourceId: 's1', kind, isScientific: true, confidence: 'medium' };
}

describe('applyPubmedTypeOverride', () => {
  it('forces kind to standards_body when PubMed pubTypes includes "Practice Guideline"', () => {
    const result = applyPubmedTypeOverride(classification('other'), ['Journal Article', 'Practice Guideline']);
    expect(result.kind).toBe('standards_body');
  });

  it('forces kind to systematic_review for "Systematic Review" and meta_analysis for "Meta-Analysis"', () => {
    expect(applyPubmedTypeOverride(classification('controlled_experiment'), ['Systematic Review']).kind).toBe('systematic_review');
    expect(applyPubmedTypeOverride(classification('controlled_experiment'), ['Meta-Analysis']).kind).toBe('meta_analysis');
  });

  it('forces kind to controlled_experiment for "Randomized Controlled Trial"', () => {
    expect(applyPubmedTypeOverride(classification('observational_study'), ['Randomized Controlled Trial']).kind).toBe('controlled_experiment');
  });

  it('leaves kind untouched when no PubMed pubType is decisive', () => {
    const original = classification('observational_study');
    expect(applyPubmedTypeOverride(original, ['Journal Article', 'Comment'])).toEqual(original);
  });

  it('leaves kind untouched when the model already agrees with the decisive type', () => {
    const original = classification('standards_body');
    const result = applyPubmedTypeOverride(original, ['Practice Guideline']);
    expect(result).toEqual(original);
  });

  it('is case-insensitive when matching pubTypes', () => {
    expect(applyPubmedTypeOverride(classification('other'), ['PRACTICE GUIDELINE']).kind).toBe('standards_body');
  });
});
