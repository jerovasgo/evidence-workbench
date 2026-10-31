import { readFileSync } from 'node:fs';
import { evaluateExtraction, evaluateSupportJudge } from '../src/modules/12-evaluation/genetic-extraction.ts';

const path = process.argv[2];
if (!path) throw new Error('Usage: node scripts/evaluate-genetics.mjs <review.json>');
const review = JSON.parse(readFileSync(path, 'utf8'));
if (!Array.isArray(review.goldIds) || !Array.isArray(review.predictions) || !Array.isArray(review.droppedReasons) || !Array.isArray(review.supportReviews)) {
  throw new Error('Review file must provide goldIds, predictions, droppedReasons and supportReviews arrays');
}
console.log(JSON.stringify({
  reviewer: review.reviewer || 'unlabelled',
  extraction: evaluateExtraction(review.goldIds, review.predictions, review.droppedReasons),
  supportJudge: evaluateSupportJudge(review.supportReviews),
}, null, 2));
