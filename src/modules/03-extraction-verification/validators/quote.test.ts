import { describe, expect, it } from 'vitest';
import {
  applyDoseRule,
  checkNumbersPreserved,
  findQuoteInPassage,
  normalizeForMatch,
} from './quote';

describe('normalizeForMatch', () => {
  it('folds case, collapses whitespace, and normalizes smart quotes', () => {
    expect(normalizeForMatch('Give  Aspirin "325 mg"’s dose')).toBe(
      "give aspirin \"325 mg\"'s dose",
    );
  });

  it('joins a word hyphenated across a line wrap', () => {
    expect(normalizeForMatch('anti-\ncoagulation')).toBe('anticoagulation');
  });
});

describe('findQuoteInPassage', () => {
  const passage =
    'In patients with suspected ACS, aspirin 325 mg should be given promptly unless contraindicated.';

  it('finds an exact verbatim quote', () => {
    const result = findQuoteInPassage(passage, 'aspirin 325 mg should be given promptly');
    expect(result).toEqual({ found: true, fuzzy: false });
  });

  it('finds a quote that only differs by case and whitespace (normalized-exact)', () => {
    const result = findQuoteInPassage(passage, '  ASPIRIN 325   MG should be given promptly  ');
    expect(result).toEqual({ found: true, fuzzy: false });
  });

  it('does not find a quote the model paraphrased (one word changed)', () => {
    const result = findQuoteInPassage(passage, 'aspirin 325 mg should be given immediately');
    expect(result.found).toBe(false);
  });

  it('accepts a 1-character OCR-noise difference as a fuzzy match', () => {
    // "promptIy" (capital I instead of l) — distance 1 from "promptly".
    const result = findQuoteInPassage(passage, 'aspirin 325 mg should be given promptIy');
    expect(result).toEqual({ found: true, fuzzy: true, distance: 1 });
  });

  it('rejects a quote that is not in the passage at all', () => {
    const result = findQuoteInPassage(passage, 'clopidogrel 75 mg should be given promptly');
    expect(result.found).toBe(false);
  });

  it('rejects an empty quote', () => {
    expect(findQuoteInPassage(passage, '')).toEqual({ found: false, fuzzy: false });
  });
});

describe('checkNumbersPreserved', () => {
  const quote = 'Aspirin 325 mg should be given promptly.';

  it('passes when the claim text repeats the same number', () => {
    expect(checkNumbersPreserved('Give aspirin 325 mg now.', quote)).toEqual({ ok: true, missing: [] });
  });

  it('fails when the claim text states a different number than the quote', () => {
    const result = checkNumbersPreserved('Give aspirin 500 mg now.', quote);
    expect(result.ok).toBe(false);
    expect(result.missing).toContain('500 mg');
  });

  it('passes for claim text with no numbers at all', () => {
    expect(checkNumbersPreserved('Give aspirin promptly.', quote)).toEqual({ ok: true, missing: [] });
  });
});

describe('applyDoseRule', () => {
  it('keeps a dose that appears verbatim in the quote', () => {
    const quote = 'Aspirin 325 mg should be given promptly.';
    expect(applyDoseRule('Give aspirin 325 mg now', quote)).toBe('Give aspirin 325 mg now');
  });

  it('replaces a dose not found in the quote with "per local protocol"', () => {
    const quote = 'Aspirin should be given promptly.'; // no dose stated
    expect(applyDoseRule('Give aspirin 325 mg now', quote)).toBe('Give aspirin per local protocol now');
  });

  it('leaves dose-free text unchanged', () => {
    const quote = 'Aspirin should be given promptly.';
    expect(applyDoseRule('Give aspirin promptly', quote)).toBe('Give aspirin promptly');
  });
});
