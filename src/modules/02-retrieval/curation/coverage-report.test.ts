import { describe, expect, it } from 'vitest';
import { buildCoverageReport } from './coverage-report';

describe('buildCoverageReport', () => {
  it('reports a well-covered sub-question as not thin, with the best level and oldest year', () => {
    const report = buildCoverageReport([
      {
        subQuestion: 'first-line treatment',
        sources: [
          { kind: 'guideline', year: 2023 },
          { kind: 'rct', year: 2019 },
        ],
      },
    ]);
    expect(report.entries[0]).toEqual({
      subQuestion: 'first-line treatment',
      sourcesFound: 2,
      bestLevel: 'guideline',
      oldestYear: 2019,
      thin: false,
    });
  });

  it('flags a sub-question with zero sources as thin, with a null best level', () => {
    const report = buildCoverageReport([{ subQuestion: 'rare complication rate', sources: [] }]);
    expect(report.entries[0]).toEqual({
      subQuestion: 'rare complication rate',
      sourcesFound: 0,
      bestLevel: null,
      oldestYear: undefined,
      thin: true,
    });
  });

  it('flags a single weak (observational-only) source as thin', () => {
    const report = buildCoverageReport([{ subQuestion: 'x', sources: [{ kind: 'observational', year: 2021 }] }]);
    expect(report.entries[0]?.thin).toBe(true);
  });

  it('does not flag a single guideline as thin, even alone', () => {
    const report = buildCoverageReport([{ subQuestion: 'x', sources: [{ kind: 'guideline', year: 2024 }] }]);
    expect(report.entries[0]?.thin).toBe(false);
  });

  it('does not flag two observational studies as thin (meets the >=2-sources half of the rule)', () => {
    const report = buildCoverageReport([
      { subQuestion: 'x', sources: [{ kind: 'observational', year: 2021 }, { kind: 'observational', year: 2020 }] },
    ]);
    expect(report.entries[0]?.thin).toBe(false);
  });
});
