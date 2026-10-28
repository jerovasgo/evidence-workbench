import { describe, expect, it } from 'vitest';
import { gradeOriginLabel, gradeSummaryLabel } from './grade-labels';

describe('gradeSummaryLabel', () => {
  it('shows certainty alone when there is no strength', () => {
    expect(gradeSummaryLabel({ certainty: 'high', origin: 'source' })).toBe('High');
  });

  it('appends direction and level when strength is present', () => {
    expect(
      gradeSummaryLabel({ certainty: 'moderate', origin: 'source', strength: { direction: 'against', level: 'conditional' } }),
    ).toBe('Moderate · Against, conditional');
  });
});

describe('gradeOriginLabel', () => {
  it('shows the verbatim native grade for a source-origin grade', () => {
    expect(gradeOriginLabel({ certainty: 'high', origin: 'source', nativeGrade: 'Class I, LOE A' })).toBe('From source: Class I, LOE A');
  });

  it('falls back to a plain "From source" when no native grade text was kept', () => {
    expect(gradeOriginLabel({ certainty: 'ungraded', origin: 'source' })).toBe('From source');
  });

  it('shows "AI-estimated" for an ai_estimated-origin grade', () => {
    expect(gradeOriginLabel({ certainty: 'ungraded', origin: 'ai_estimated' })).toBe('AI-estimated');
  });
});
