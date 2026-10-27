import { describe, expect, it } from 'vitest';
import { CandidateSourceSchema, CoverageReportSchema, SearchPlanSchema } from './retrieval';

describe('SearchPlanSchema', () => {
  it('accepts a plan with queries across several families', () => {
    const plan = {
      queries: [
        { family: 'pubmed' as const, text: 'acute coronary syndrome[MeSH]', purpose: 'first-line treatment' },
        { family: 'web' as const, text: 'ACS guideline controversy', purpose: 'adversarial query' },
      ],
      mustFind: ['2023 AHA ACS guideline'],
    };
    expect(SearchPlanSchema.parse(plan)).toEqual(plan);
  });

  it('rejects more than 12 queries', () => {
    const queries = Array.from({ length: 13 }, (_, i) => ({
      family: 'pubmed' as const,
      text: `query ${i}`,
      purpose: 'x',
    }));
    expect(() => SearchPlanSchema.parse({ queries })).toThrow();
  });
});

describe('CandidateSourceSchema', () => {
  it('accepts a minimal candidate with only the required fields', () => {
    const candidate = {
      tempId: 'cand_1',
      family: 'pubmed' as const,
      title: 'Some guideline',
      url: 'https://example.org/guideline',
    };
    expect(CandidateSourceSchema.parse(candidate)).toEqual(candidate);
  });

  it('accepts model-supplied relevance/quality features in [0,1]', () => {
    const candidate = {
      tempId: 'cand_1',
      family: 'pubmed' as const,
      title: 'x',
      url: 'https://example.org/x',
      relevance: 0.9,
      quality: 0.8,
    };
    expect(() => CandidateSourceSchema.parse(candidate)).not.toThrow();
  });

  it('rejects a relevance value outside [0,1]', () => {
    const candidate = { tempId: 'c1', family: 'pubmed' as const, title: 'x', url: 'https://example.org/x', relevance: 1.5 };
    expect(() => CandidateSourceSchema.parse(candidate)).toThrow();
  });
});

describe('CoverageReportSchema', () => {
  it('accepts a report with a thin and a well-covered sub-question', () => {
    const report = {
      entries: [
        { subQuestion: 'first-line treatment', sourcesFound: 3, bestLevel: 'guideline' as const, oldestYear: 2020, thin: false },
        { subQuestion: 'rare complication rate', sourcesFound: 0, bestLevel: null, thin: true },
      ],
    };
    expect(CoverageReportSchema.parse(report)).toEqual(report);
  });
});
