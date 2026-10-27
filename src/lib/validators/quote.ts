import { levenshteinDistance } from './levenshtein.js';

// Module 03 deterministic verification, step 2 ("Quote found") and step 5 ("Numbers").
// CLAUDE.md non-negotiable rule: "A claim is displayed only if ... the quote appears
// verbatim in the fetched text". This is the only place that decides quoteFound.

const MAX_FUZZY_DISTANCE = 2;

/**
 * Normalizes text the same way on both sides of a comparison: Unicode NFKC, smart
 * quotes/ligatures to plain ASCII, soft hyphens and zero-width spaces removed,
 * line-wrap hyphenation joined, whitespace collapsed, case-folded. This is
 * "normalized-exact" per docs/architecture/03-claim-extraction-and-verification.md —
 * it must never be loose enough to match a materially different sentence.
 */
// Built from numeric code points (not literal characters) so the invisible/confusable
// glyphs themselves never appear in this source file — keeps `no-irregular-whitespace`
// happy and avoids any ambiguity about what byte is actually here.
const codePoints = (points: number[]) => points.map((cp) => String.fromCodePoint(cp)).join('|');

// Soft hyphen (0x00AD), zero-width space (0x200B), BOM (0xFEFF).
const INVISIBLE_CHARS_PATTERN = new RegExp(codePoints([0x00ad, 0x200b, 0xfeff]), 'g');
// Left/right single quotation mark, modifier letter apostrophe.
const CURLY_SINGLE_QUOTES_PATTERN = new RegExp(codePoints([0x2018, 0x2019, 0x02bc]), 'g');
// Left/right double quotation mark.
const CURLY_DOUBLE_QUOTES_PATTERN = new RegExp(codePoints([0x201c, 0x201d]), 'g');

export function normalizeForMatch(text: string): string {
  return text
    .normalize('NFKC')
    .replace(INVISIBLE_CHARS_PATTERN, '')
    .replace(/-\s*\n\s*/g, '') // join a word hyphenated across a line wrap
    .replace(CURLY_SINGLE_QUOTES_PATTERN, "'")
    .replace(CURLY_DOUBLE_QUOTES_PATTERN, '"')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export interface QuoteMatch {
  found: boolean;
  /** true if only a normalized-exact match failed and a bounded fuzzy match (<=2 edits) succeeded. */
  fuzzy: boolean;
  distance?: number;
}

/**
 * Looks for `quote` inside `passageText`. Exact (after normalization) is the target;
 * a fuzzy fallback only tolerates OCR-level noise (edit distance <= 2) and must be
 * surfaced to the caller as `fuzzy: true` so the UI can show the original text
 * (docs/architecture/03-claim-extraction-and-verification.md, step 2).
 */
export function findQuoteInPassage(passageText: string, quote: string): QuoteMatch {
  const normalizedQuote = normalizeForMatch(quote);
  if (normalizedQuote.length === 0) return { found: false, fuzzy: false };

  const normalizedPassage = normalizeForMatch(passageText);
  if (normalizedPassage.includes(normalizedQuote)) {
    return { found: true, fuzzy: false };
  }

  const distance = bestFuzzyDistance(normalizedPassage, normalizedQuote);
  if (distance !== null && distance <= MAX_FUZZY_DISTANCE) {
    return { found: true, fuzzy: true, distance };
  }

  return { found: false, fuzzy: false };
}

/**
 * Slides a window the length of the quote (+/- the max tolerated distance) across the
 * passage and returns the best (lowest) edit distance found. O(passage length * quote
 * length), acceptable for the <=1,200-token passage windows module 02/03 use.
 */
function bestFuzzyDistance(passage: string, quote: string): number | null {
  if (quote.length === 0 || passage.length < quote.length - MAX_FUZZY_DISTANCE) return null;

  let best: number | null = null;
  const minWindow = Math.max(1, quote.length - MAX_FUZZY_DISTANCE);
  const maxWindow = Math.min(passage.length, quote.length + MAX_FUZZY_DISTANCE);

  for (let windowLen = minWindow; windowLen <= maxWindow; windowLen++) {
    for (let start = 0; start + windowLen <= passage.length; start++) {
      const candidate = passage.slice(start, start + windowLen);
      const distance = levenshteinDistance(candidate, quote);
      if (best === null || distance < best) best = distance;
      if (best === 0) return 0;
    }
  }
  return best;
}

const NUMBER_PATTERN = /\d+(?:[.,]\d+)?\s?(?:mg|mcg|µg|g|kg|mL|ml|L|units?|iu|mmHg|mEq|bpm|%)?/gi;

/** Extracts number(+unit) tokens, e.g. "325 mg", "90", "2.5 mL", for the module 03 "numbers" check. */
export function extractNumberTokens(text: string): string[] {
  return [...text.matchAll(NUMBER_PATTERN)].map((m) => m[0].trim()).filter((t) => t.length > 0);
}

export interface NumbersCheckResult {
  ok: boolean;
  missing: string[];
}

/**
 * Module 03 step 5: every number/unit in the claim text must also appear in the quote
 * (after normalization). Catches the case where the model copies a correct quote but
 * then states a different number in the paraphrased claim text.
 */
export function checkNumbersPreserved(claimText: string, quote: string): NumbersCheckResult {
  const normalizedQuote = normalizeForMatch(quote);
  const missing = extractNumberTokens(claimText).filter(
    (token) => !normalizedQuote.includes(normalizeForMatch(token)),
  );
  return { ok: missing.length === 0, missing };
}

const DOSE_PATTERN = /\b\d+(?:[.,]\d+)?\s?(?:mg|mcg|µg|g|kg|mL|ml|L|units?|iu|mEq)\b/gi;

/**
 * Module 03 step 6 / CLAUDE.md rule 6: a dose in `text` must appear in `quote`, or it
 * is replaced with "per local protocol". Thresholds that are not doses (e.g. "SBP <
 * 90 mmHg") are left to the caller's own threshold-specific check if needed; this
 * function only targets dose-unit patterns (mg, mL, units, etc.).
 */
export function applyDoseRule(text: string, quote: string): string {
  const normalizedQuote = normalizeForMatch(quote);
  return text.replace(DOSE_PATTERN, (match) =>
    normalizedQuote.includes(normalizeForMatch(match)) ? match : 'per local protocol',
  );
}
