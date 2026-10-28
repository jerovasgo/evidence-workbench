import { describe, expect, it } from 'vitest';
import { mapNativeGrade, type GradeMapResult } from './grade-maps';

// Architecture doc eval target: "100% of fixture strings (>=40 real-format grade
// strings across schemes) map to the expected values; unknown schemes remain
// ungraded." Fixture strings below are written in the free-text shapes a
// claim-extractor (P5) could plausibly copy verbatim from a passage, not just the
// bare scheme codes.

describe('mapNativeGrade — ACC/AHA', () => {
  const cases: [string, GradeMapResult][] = [
    ['Class I, Level of Evidence: A', { certainty: 'high', strength: { direction: 'for', level: 'strong' }, scheme: 'ACC/AHA' }],
    ['Class I, LOE B-R', { certainty: 'moderate', strength: { direction: 'for', level: 'strong' }, scheme: 'ACC/AHA' }],
    ['Class I, LOE B-NR', { certainty: 'moderate', strength: { direction: 'for', level: 'strong' }, scheme: 'ACC/AHA' }],
    ['Class I, LOE C-LD', { certainty: 'low', strength: { direction: 'for', level: 'strong' }, scheme: 'ACC/AHA' }],
    ['Class I, LOE C-EO', { certainty: 'very_low', strength: { direction: 'for', level: 'strong' }, scheme: 'ACC/AHA' }],
    ['Class IIa, LOE B-R', { certainty: 'moderate', strength: { direction: 'for', level: 'conditional' }, scheme: 'ACC/AHA' }],
    ['Class IIb, LOE C-LD', { certainty: 'low', strength: { direction: 'for', level: 'conditional' }, scheme: 'ACC/AHA' }],
    ['Class III: No Benefit, LOE B-R', { certainty: 'moderate', strength: { direction: 'against', level: 'conditional' }, scheme: 'ACC/AHA' }],
    ['Class III: Harm, LOE B-NR', { certainty: 'moderate', strength: { direction: 'against', level: 'strong' }, scheme: 'ACC/AHA' }],
    ['Class I (no level of evidence given)', { certainty: 'ungraded', strength: { direction: 'for', level: 'strong' }, scheme: 'ACC/AHA' }],
    ['Class I (Level of Evidence: B-R)', { certainty: 'moderate', strength: { direction: 'for', level: 'strong' }, scheme: 'ACC/AHA' }],
  ];

  it.each(cases)('%s', (text, expected) => {
    expect(mapNativeGrade(text)).toEqual(expected);
  });

  it('leaves strength undefined for a bare Class III with no Harm/No Benefit qualifier', () => {
    const result = mapNativeGrade('Class III, LOE A');
    expect(result).toEqual({ certainty: 'high', strength: undefined, scheme: 'ACC/AHA' });
  });
});

describe('mapNativeGrade — GRADE', () => {
  const cases: [string, GradeMapResult][] = [
    ['Strong recommendation, high certainty of evidence', { certainty: 'high', strength: { direction: 'for', level: 'strong' }, scheme: 'GRADE' }],
    ['Strong recommendation, moderate certainty of evidence', { certainty: 'moderate', strength: { direction: 'for', level: 'strong' }, scheme: 'GRADE' }],
    ['Strong recommendation, low certainty of evidence', { certainty: 'low', strength: { direction: 'for', level: 'strong' }, scheme: 'GRADE' }],
    ['Strong recommendation, very low certainty of evidence', { certainty: 'very_low', strength: { direction: 'for', level: 'strong' }, scheme: 'GRADE' }],
    ['Conditional recommendation, high certainty of evidence', { certainty: 'high', strength: { direction: 'for', level: 'conditional' }, scheme: 'GRADE' }],
    ['Conditional recommendation, moderate certainty of evidence', { certainty: 'moderate', strength: { direction: 'for', level: 'conditional' }, scheme: 'GRADE' }],
    ['Conditional recommendation, low certainty of evidence', { certainty: 'low', strength: { direction: 'for', level: 'conditional' }, scheme: 'GRADE' }],
    ['Conditional recommendation, very low certainty of evidence', { certainty: 'very_low', strength: { direction: 'for', level: 'conditional' }, scheme: 'GRADE' }],
    ['Strong recommendation against, high certainty of evidence', { certainty: 'high', strength: { direction: 'against', level: 'strong' }, scheme: 'GRADE' }],
    ['Conditional recommendation against, moderate certainty of evidence', { certainty: 'moderate', strength: { direction: 'against', level: 'conditional' }, scheme: 'GRADE' }],
    ['Weak recommendation, low certainty of evidence', { certainty: 'low', strength: { direction: 'for', level: 'conditional' }, scheme: 'GRADE' }],
    ['Strong recommendation, high quality of evidence', { certainty: 'high', strength: { direction: 'for', level: 'strong' }, scheme: 'GRADE' }],
  ];

  it.each(cases)('%s', (text, expected) => {
    expect(mapNativeGrade(text)).toEqual(expected);
  });
});

describe('mapNativeGrade — USPSTF', () => {
  const cases: [string, GradeMapResult][] = [
    ['USPSTF Grade A', { certainty: 'high', strength: { direction: 'for', level: 'strong' }, scheme: 'USPSTF' }],
    ['USPSTF Grade B', { certainty: 'moderate', strength: { direction: 'for', level: 'strong' }, scheme: 'USPSTF' }],
    ['USPSTF Grade C', { certainty: 'moderate', strength: { direction: 'for', level: 'conditional' }, scheme: 'USPSTF' }],
    ['USPSTF Grade D', { certainty: 'moderate', strength: { direction: 'against', level: 'strong' }, scheme: 'USPSTF' }],
    ['USPSTF Grade I (insufficient evidence)', { certainty: 'ungraded', strength: undefined, scheme: 'USPSTF' }],
    ['uspstf grade b', { certainty: 'moderate', strength: { direction: 'for', level: 'strong' }, scheme: 'USPSTF' }],
    ['USPSTF: Grade C', { certainty: 'moderate', strength: { direction: 'for', level: 'conditional' }, scheme: 'USPSTF' }],
  ];

  it.each(cases)('%s', (text, expected) => {
    expect(mapNativeGrade(text)).toEqual(expected);
  });
});

describe('mapNativeGrade — Oxford CEBM', () => {
  const cases: [string, GradeMapResult][] = [
    ['Oxford CEBM Level 1a', { certainty: 'high', strength: undefined, scheme: 'Oxford CEBM' }],
    ['Oxford CEBM Level 1b', { certainty: 'high', strength: undefined, scheme: 'Oxford CEBM' }],
    ['Oxford CEBM Level 2a', { certainty: 'moderate', strength: undefined, scheme: 'Oxford CEBM' }],
    ['Oxford CEBM Level 2b', { certainty: 'moderate', strength: undefined, scheme: 'Oxford CEBM' }],
    ['Oxford CEBM Level 3a', { certainty: 'low', strength: undefined, scheme: 'Oxford CEBM' }],
    ['Oxford CEBM Level 3b', { certainty: 'low', strength: undefined, scheme: 'Oxford CEBM' }],
    ['Oxford CEBM Level 4', { certainty: 'low', strength: undefined, scheme: 'Oxford CEBM' }],
    ['Oxford CEBM Level 5', { certainty: 'very_low', strength: undefined, scheme: 'Oxford CEBM' }],
    ['CEBM Level 2b', { certainty: 'moderate', strength: undefined, scheme: 'Oxford CEBM' }],
    ['Oxford Level 3a', { certainty: 'low', strength: undefined, scheme: 'Oxford CEBM' }],
  ];

  it.each(cases)('%s', (text, expected) => {
    expect(mapNativeGrade(text)).toEqual(expected);
  });
});

describe('mapNativeGrade — unrecognized schemes', () => {
  const unrecognized = [
    'Local hospital protocol grade 2',
    'SIGN grade B',
    'Expert consensus, not formally graded',
    'Level 2b', // CEBM-shaped code but no CEBM/Oxford keyword — too ambiguous to assume
  ];

  it.each(unrecognized)('returns null for %s', (text) => {
    expect(mapNativeGrade(text)).toBeNull();
  });
});
