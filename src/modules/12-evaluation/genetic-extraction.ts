export type SupportLabel = 'supports' | 'partial' | 'no' | 'unknown';

export interface ReviewedPrediction {
  claimId: string;
  /** Assigned by a human reviewer after reading the cited passage. */
  matchedGoldId: string | null;
  relevant: boolean;
}

export interface ExtractionEvaluation {
  precision: number | null;
  recall: number | null;
  truePositive: number;
  falsePositive: number;
  falseNegative: number;
  dropReasons: Record<string, number>;
}

/** Explicit reviewer mappings prevent a text-similarity heuristic from inflating recall. */
export function evaluateExtraction(goldIds: string[], predictions: ReviewedPrediction[], droppedReasons: string[]): ExtractionEvaluation {
  const gold = new Set(goldIds);
  const matched = new Set<string>();
  let truePositive = 0;
  let falsePositive = 0;
  for (const prediction of predictions) {
    const id = prediction.matchedGoldId;
    if (prediction.relevant && id && gold.has(id) && !matched.has(id)) {
      truePositive++;
      matched.add(id);
    } else falsePositive++;
  }
  const dropReasons: Record<string, number> = {};
  for (const reason of droppedReasons) dropReasons[reason] = (dropReasons[reason] ?? 0) + 1;
  return {
    precision: predictions.length ? truePositive / predictions.length : null,
    recall: gold.size ? truePositive / gold.size : null,
    truePositive,
    falsePositive,
    falseNegative: gold.size - matched.size,
    dropReasons,
  };
}

export interface JudgeReview { claimId: string; human: SupportLabel; judge: SupportLabel }

/** Cohen's kappa and confusion matrix; undefined with no reviewed or non-varying labels. */
export function evaluateSupportJudge(reviews: JudgeReview[]): { agreement: number | null; kappa: number | null; confusion: Record<SupportLabel, Record<SupportLabel, number>> } {
  const labels: SupportLabel[] = ['supports', 'partial', 'no', 'unknown'];
  const confusion = Object.fromEntries(labels.map((human) => [human, Object.fromEntries(labels.map((judge) => [judge, 0]))])) as Record<SupportLabel, Record<SupportLabel, number>>;
  if (!reviews.length) return { agreement: null, kappa: null, confusion };
  for (const review of reviews) confusion[review.human][review.judge]++;
  const n = reviews.length;
  const observed = reviews.filter((review) => review.human === review.judge).length / n;
  const expected = labels.reduce((sum, label) => {
    const human = reviews.filter((review) => review.human === label).length / n;
    const judge = reviews.filter((review) => review.judge === label).length / n;
    return sum + human * judge;
  }, 0);
  return { agreement: observed, kappa: expected === 1 ? null : (observed - expected) / (1 - expected), confusion };
}
