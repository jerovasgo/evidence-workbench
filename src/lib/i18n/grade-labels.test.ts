import { describe, expect, it } from 'vitest';
import { gradeCertaintyLabel, gradeProvenanceLabel, gradeStrengthLabel } from './grade-labels';

describe('gradeCertaintyLabel', () => {
  it('shows the mapped certainty level', () => {
    expect(gradeCertaintyLabel({ certainty: 'high', origin: 'source' })).toBe('High');
    expect(gradeCertaintyLabel({ certainty: 'moderate', origin: 'source' })).toBe('Moderate');
  });

  it('shows "Not graded" for ungraded, regardless of origin', () => {
    expect(gradeCertaintyLabel({ certainty: 'ungraded', origin: 'source' })).toBe('Not graded');
    expect(gradeCertaintyLabel({ certainty: 'ungraded', origin: 'ai_estimated' })).toBe('Not graded');
  });
});

describe('gradeStrengthLabel', () => {
  it('formats direction and level independently of certainty', () => {
    expect(gradeStrengthLabel({ direction: 'for', level: 'strong' })).toBe('For, strong');
    expect(gradeStrengthLabel({ direction: 'against', level: 'conditional' })).toBe('Against, conditional');
  });
});

describe('gradeProvenanceLabel', () => {
  it('shows "From source: <text>" for a recognized, mapped grade', () => {
    expect(gradeProvenanceLabel({ certainty: 'high', origin: 'source', nativeGrade: 'Class I, LOE A' })).toBe('From source: Class I, LOE A');
  });

  it('still shows the raw text, labeled as unrecognized, when the scheme did not map', () => {
    expect(gradeProvenanceLabel({ certainty: 'ungraded', origin: 'source', nativeGrade: 'Local protocol grade 2' })).toBe(
      'Source printed a grade in an unrecognized scheme: "Local protocol grade 2"',
    );
  });

  it('returns undefined when there is no native grade text at all', () => {
    expect(gradeProvenanceLabel({ certainty: 'ungraded', origin: 'ai_estimated' })).toBeUndefined();
  });

  it('returns undefined for an ai_estimated origin even if nativeGrade were somehow set', () => {
    expect(gradeProvenanceLabel({ certainty: 'ungraded', origin: 'ai_estimated', nativeGrade: 'should not happen' })).toBeUndefined();
  });
});
