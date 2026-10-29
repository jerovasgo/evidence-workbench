import { describe, expect, it } from 'vitest';
import { buildCoverageReport } from './coverage-report';

describe('buildCoverageReport', () => {
  it('reports a well-covered sub-question as not thin, with the best level and oldest year', () => {
    const report = buildCoverageReport([
      {
        subQuestion: 'reaction rate',
        sources: [
          { kind: 'standards_body', year: 2023 },
          { kind: 'controlled_experiment', year: 2019 },
        ],
      },
    ]);
    expect(report.entries[0]).toEqual({
      subQuestion: 'reaction rate',
      sourcesFound: 2,
      bestLevel: 'standards_body',
      oldestYear: 2019,
      thin: false,
    });
  });

  it('flags a sub-question with zero sources as thin, with a null best level', () => {
    const report = buildCoverageReport([{ subQuestion: 'rare side reaction', sources: [] }]);
    expect(report.entries[0]).toEqual({
      subQuestion: 'rare side reaction',
      sourcesFound: 0,
      bestLevel: null,
      oldestYear: undefined,
      thin: true,
    });
  });

  it('flags a single weak (observational-only) source as thin', () => {
    const report = buildCoverageReport([{ subQuestion: 'x', sources: [{ kind: 'observational_study', year: 2021 }] }]);
    expect(report.entries[0]?.thin).toBe(true);
  });

  it('does not flag a single standards-body source as thin, even alone', () => {
    const report = buildCoverageReport([{ subQuestion: 'x', sources: [{ kind: 'standards_body', year: 2024 }] }]);
    expect(report.entries[0]?.thin).toBe(false);
  });

  it('does not flag two observational studies as thin (meets the >=2-sources half of the rule)', () => {
    const report = buildCoverageReport([
      { subQuestion: 'x', sources: [{ kind: 'observational_study', year: 2021 }, { kind: 'observational_study', year: 2020 }] },
    ]);
    expect(report.entries[0]?.thin).toBe(false);
  });
});
