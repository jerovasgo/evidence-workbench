# Human review of genetic extraction

Copy `review-template.json` to a new file. Record the reviewer and date. For each study, enumerate every question-relevant finding in the source as a stable `goldId`; review all proposed claims against their original passages, then fill `predictions` with `{ "claimId": "...", "matchedGoldId": "..." | null, "relevant": true | false }`. A duplicate proposed claim should link to the same gold id; the evaluator counts the duplicate as a false positive. Put every technical rejection reason in `droppedReasons`.

For judge calibration, review each claim independently of the model verdict and add `{ "claimId": "...", "human": "supports|partial|no|unknown", "judge": "supports|partial|no|unknown" }` to `supportReviews`. Use at least 60 independently reviewed claims before interpreting Cohen's κ. Keep a held-out article outside prompt development. Run `node scripts/evaluate-genetics.mjs <review-file.json>` to calculate precision, recall, drop-reason counts, the support confusion matrix and κ. Empty labels return `null` metrics rather than an invented score.

The live pilot in `FINDINGS.md` is diagnostic. It has not been independently annotated and must not be presented as a validated accuracy result.
