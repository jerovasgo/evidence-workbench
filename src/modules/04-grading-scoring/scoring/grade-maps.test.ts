import { describe, expect, it } from 'vitest';
import { mapNativeGrade, type GradeMapResult } from './grade-maps';

// 2026-10-29 pivot (docs/DECISIONS.md): replaces the four clinical-scheme fixture
// sets (ACC/AHA, GRADE, USPSTF, Oxford CEBM) with one general-science certainty
// mapper. Fixture strings below are written in the free-text shapes a
// claim-extractor (P5) could plausibly copy verbatim from a passage.

describe('mapNativeGrade — general-science certainty language', () => {
  const cases: [string, GradeMapResult][] = [
    ['A meta-analysis of 12 trials found', { certainty: 'high', scheme: 'general-science' }],
    ['This is a well-established result in the field', { certainty: 'high', scheme: 'general-science' }],
    ['There is scientific consensus that', { certainty: 'high', scheme: 'general-science' }],
    ['The finding is widely accepted among researchers', { certainty: 'moderate', scheme: 'general-science' }],
    ['This result has been independently replicated', { certainty: 'moderate', scheme: 'general-science' }],
    ['A preliminary finding suggests', { certainty: 'low', scheme: 'general-science' }],
    ['Based on a single study with a small sample', { certainty: 'low', scheme: 'general-science' }],
    ['This remains disputed among experts', { certainty: 'very_low', scheme: 'general-science' }],
    ['The original result was not replicated in a follow-up study', { certainty: 'very_low', scheme: 'general-science' }],
    ['MAPPING IS CASE insensitive: WELL-ESTABLISHED consensus', { certainty: 'high', scheme: 'general-science' }],
  ];

  it.each(cases)('%s', (text, expected) => {
    expect(mapNativeGrade(text)).toEqual(expected);
  });
});

describe('mapNativeGrade — unrecognized phrasing', () => {
  const unrecognized = [
    'Local lab protocol, internal grade 2',
    'Reported without any certainty language',
    'See Table 3 for details',
  ];

  it.each(unrecognized)('returns null for %s', (text) => {
    expect(mapNativeGrade(text)).toBeNull();
  });
});
