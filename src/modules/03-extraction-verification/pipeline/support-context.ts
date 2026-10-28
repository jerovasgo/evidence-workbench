import { normalizeForMatch } from '../validators/quote';

// Module 03 support-judge input prep (docs/architecture/03-claim-extraction-and-
// verification.md: "the surrounding context (+/-800 chars around the quote located
// by code)"). Operates on normalized text (same normalization `findQuoteInPassage`
// already used to confirm the quote is really there — ligatures/smart-quotes/
// whitespace collapsed) so the quote reliably locates as a substring; this is model
// input, not something shown to the clinician verbatim, so losing exact original
// punctuation here is an acceptable tradeoff for reliable location.

const DEFAULT_RADIUS_CHARS = 800;

/**
 * Returns up to `radiusChars` characters of context on each side of `quote` within
 * `passageText`. Callers should only call this after `findQuoteInPassage` has
 * already confirmed the quote is present — if the (normalized) quote still can't be
 * located, this falls back to the start of the passage rather than throwing, since
 * support-judge's own instructions are to say "unknown" rather than guess when the
 * context is insufficient.
 */
export function extractSurroundingContext(passageText: string, quote: string, radiusChars = DEFAULT_RADIUS_CHARS): string {
  const normalizedPassage = normalizeForMatch(passageText);
  const normalizedQuote = normalizeForMatch(quote);

  const index = normalizedPassage.indexOf(normalizedQuote);
  if (index === -1) {
    return normalizedPassage.slice(0, radiusChars * 2);
  }

  const start = Math.max(0, index - radiusChars);
  const end = Math.min(normalizedPassage.length, index + normalizedQuote.length + radiusChars);
  return normalizedPassage.slice(start, end);
}
