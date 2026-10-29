import type { CoverageReport } from '../schemas/retrieval';
import type { SourceKind } from '@/shared/domain';

// Module 02 deterministic curation, step 8: "Coverage report: per sub-question:
// sources found, best level, oldest year, 'thin' flag."

const LEVEL_RANK: Record<SourceKind, number> = {
  meta_analysis: 5,
  standards_body: 4,
  local_protocol: 4,
  systematic_review: 3,
  controlled_experiment: 2,
  observational_study: 1,
  preprint: 1,
  reference_work: 1,
  dataset_or_database: 0,
  other: 0,
};

const STRONG_LEVELS = new Set<SourceKind>(['meta_analysis', 'standards_body', 'local_protocol', 'systematic_review']);

export interface SubQuestionCoverageInput {
  subQuestion: string;
  sources: { kind: SourceKind; year?: number }[];
}

/**
 * "Thin" (module 01's stop rule / module 02's coverage flag): no sources at all, or
 * fewer than 2 sources and none of them a meta-analysis/standards body/local
 * protocol/systematic review.
 */
function isThin(sources: { kind: SourceKind }[]): boolean {
  if (sources.length === 0) return true;
  const hasStrongSource = sources.some((s) => STRONG_LEVELS.has(s.kind));
  return !hasStrongSource && sources.length < 2;
}

export function buildCoverageReport(inputs: SubQuestionCoverageInput[]): CoverageReport {
  const entries = inputs.map(({ subQuestion, sources }) => {
    const bestLevel =
      sources.length === 0
        ? null
        : sources.reduce((best, s) => (LEVEL_RANK[s.kind] > LEVEL_RANK[best.kind] ? s : best)).kind;

    const years = sources.map((s) => s.year).filter((y): y is number => y !== undefined);
    const oldestYear = years.length > 0 ? Math.min(...years) : undefined;

    return {
      subQuestion,
      sourcesFound: sources.length,
      bestLevel,
      oldestYear,
      thin: isThin(sources),
    };
  });

  return { entries };
}
