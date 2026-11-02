// 2026-11-02 (docs/DECISIONS.md): replaces the raw internal status strings the
// Selection & review coverage panel used to show verbatim (`'unreviewed'`,
// `'extraction_failed'`, or the bare fallback `'No completion record yet'`) with
// plain-language labels, same shape as `grade-labels.ts`.

const SOURCE_STATUS_LABEL: Record<string, string> = {
  ok: 'Evaluated',
  no_full_text: 'Could not access full text',
  extraction_failed: 'Extraction failed',
  pending: 'Pending evaluation',
};

/** Falls back to the raw status, title-cased, rather than hiding an unrecognized one. */
export function sourceReviewStatusLabel(status: string): string {
  return SOURCE_STATUS_LABEL[status] ?? (status ? `${status[0]!.toUpperCase()}${status.slice(1)}` : 'Not yet started');
}

const PASSAGE_STATUS_LABEL: Record<string, string> = {
  pending: 'Not yet reached',
  reviewed: 'Reviewed',
  unreviewed: 'Not reviewed',
};

export function passageStatusLabel(status: string): string {
  return PASSAGE_STATUS_LABEL[status] ?? status;
}
