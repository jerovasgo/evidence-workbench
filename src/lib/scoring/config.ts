import type { SourceKind } from '../schemas/source';

// SPEC §8 scoring rule: "relevance × level × quality × currency × applicability.
// Initial values, to calibrate." These are exactly that — Day-1 starting weights, not
// tuned against real outcomes yet.

export const LEVEL_WEIGHTS: Record<SourceKind, number> = {
  guideline: 1.0,
  systematic_review: 0.85,
  rct: 0.7,
  observational: 0.45,
  // Not in SPEC's example list; local_protocol carries the same authority weight as
  // a guideline for *this* clinician's setting, pathway_db is corroboration-only data
  // (never itself a recommendation), scored low like 'other'.
  local_protocol: 1.0,
  pathway_db: 0.2,
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
