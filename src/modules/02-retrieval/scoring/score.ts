import type { SourceKind } from '@/shared/domain';
import {
  type Applicability,
  APPLICABILITY_WEIGHTS,
  CURRENCY_FULL_WEIGHT_MAX_AGE_YEARS,
  CURRENCY_HALF_WEIGHT_AGE_YEARS,
  CURRENCY_MIN_WEIGHT,
  CURRENCY_SUPERSEDED_WEIGHT,
  CURRENCY_UNKNOWN_YEAR_WEIGHT,
  LEVEL_WEIGHTS,
} from './config';

// SPEC §8: "Source score (computed by code; the model supplies features only):
// relevance × level × quality × currency × applicability." relevance/quality are
// model-supplied 0-1 features; level/currency/applicability are computed here.

export interface SourceScoreInput {
  relevance: number;
  quality: number;
  kind: SourceKind;
  year?: number;
  isSuperseded: boolean;
  applicability: Applicability;
  now?: Date;
}

/** currency: 1.0 at <=3y, decaying linearly to 0.5 at 10y, floored at 0.5 beyond that; superseded forces 0.2. */
export function computeCurrency(year: number | undefined, isSuperseded: boolean, now: Date = new Date()): number {
  if (isSuperseded) return CURRENCY_SUPERSEDED_WEIGHT;
  if (year === undefined) return CURRENCY_UNKNOWN_YEAR_WEIGHT;

  const ageYears = now.getFullYear() - year;
  if (ageYears <= CURRENCY_FULL_WEIGHT_MAX_AGE_YEARS) return 1.0;
  if (ageYears >= CURRENCY_HALF_WEIGHT_AGE_YEARS) return CURRENCY_MIN_WEIGHT;

  const span = CURRENCY_HALF_WEIGHT_AGE_YEARS - CURRENCY_FULL_WEIGHT_MAX_AGE_YEARS;
  const progress = (ageYears - CURRENCY_FULL_WEIGHT_MAX_AGE_YEARS) / span;
  return 1.0 - progress * (1.0 - CURRENCY_MIN_WEIGHT);
}

export function computeSourceScore(input: SourceScoreInput): number {
  const levelWeight = LEVEL_WEIGHTS[input.kind];
  const currency = computeCurrency(input.year, input.isSuperseded, input.now);
  const applicability = APPLICABILITY_WEIGHTS[input.applicability];
  return input.relevance * levelWeight * input.quality * currency * applicability;
}
