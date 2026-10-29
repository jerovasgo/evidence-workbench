import type { SourceKind } from '@/shared/domain';

// SPEC §8 scoring rule: "relevance × level × quality × currency × applicability.
// Initial values, to calibrate." These are exactly that — Day-1 starting weights, not
// tuned against real outcomes yet.

// 2026-10-29 pivot: rekeyed to the general-science SourceKind (shared/domain/
// source.ts). meta_analysis/systematic_review keep the top tier (aggregate
// evidence); controlled_experiment/observational_study replace rct/observational
// at the same relative weights; preprint is new (not yet peer-reviewed, scored
// below a controlled experiment but above a raw dataset); standards_body
// (IUPAC/NIST/ISO-style) takes the old guideline weight; local_protocol keeps the
// same full weight for *this* lab's own context; dataset_or_database is
// corroboration-only data (never itself a finding), scored low like 'other'.
export const LEVEL_WEIGHTS: Record<SourceKind, number> = {
  meta_analysis: 1.0,
  systematic_review: 0.85,
  controlled_experiment: 0.7,
  observational_study: 0.45,
  preprint: 0.35,
  reference_work: 0.6,
  standards_body: 0.9,
  dataset_or_database: 0.2,
  local_protocol: 1.0,
  other: 0.2,
};

export const APPLICABILITY_WEIGHTS = {
  match: 1.0,
  partial: 0.8,
  mismatch: 0.6,
} as const;
export type Applicability = keyof typeof APPLICABILITY_WEIGHTS;

export const CURRENCY_FULL_WEIGHT_MAX_AGE_YEARS = 3;
export const CURRENCY_HALF_WEIGHT_AGE_YEARS = 10;
export const CURRENCY_MIN_WEIGHT = 0.5;
export const CURRENCY_UNKNOWN_YEAR_WEIGHT = 0.7;
export const CURRENCY_SUPERSEDED_WEIGHT = 0.2;
