import type { Passage } from '@/shared/domain';

// Module 03: "one call per source" to `claim-extractor` with passages windowed to
// <=1,200 tokens each, carrying a locator. No real tokenizer is wired in yet, so
// tokens are approximated as words / WORDS_PER_TOKEN — a documented approximation
// (module 03's "Build notes" doesn't mandate a specific tokenizer), not a precise
// count. Windows are built from paragraph boundaries so a quote is never split
// mid-sentence by this step; a single paragraph longer than the window budget is
// kept whole rather than cut (the extractor prompt is given a largest-safe guess —
// a long outlier paragraph is still better than a split quote).

const WORDS_PER_TOKEN = 0.75;
const MAX_TOKENS_PER_WINDOW = 1200;
const MAX_WORDS_PER_WINDOW = Math.round(MAX_TOKENS_PER_WINDOW * WORDS_PER_TOKEN);

function wordCount(text: string): number {
  return text.split(/\s+/).filter((w) => w.length > 0).length;
}

function splitParagraphs(text: string): string[] {
  return text
    .split(/\n\s*\n+/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
}

/** Builds `Passage[]` for `sourceId` from fetched full text, windowed by paragraph. */
export function windowText(sourceId: string, fullText: string): Passage[] {
  const paragraphs = splitParagraphs(fullText);
  if (paragraphs.length === 0) return [];

  const passages: Passage[] = [];
  let windowStart = 0;
  let windowParagraphs: string[] = [];
  let windowWords = 0;

  function flush(endIndexInclusive: number): void {
    if (windowParagraphs.length === 0) return;
    const locator = windowStart === endIndexInclusive ? `¶${windowStart + 1}` : `¶${windowStart + 1}-${endIndexInclusive + 1}`;
    passages.push({
      id: `${sourceId}:${passages.length}`,
      sourceId,
      locator,
      text: windowParagraphs.join('\n\n'),
    });
    windowParagraphs = [];
    windowWords = 0;
  }

  for (let i = 0; i < paragraphs.length; i++) {
    const paragraph = paragraphs[i]!;
    const words = wordCount(paragraph);

    if (windowParagraphs.length > 0 && windowWords + words > MAX_WORDS_PER_WINDOW) {
      flush(i - 1);
      windowStart = i;
    }

    windowParagraphs.push(paragraph);
    windowWords += words;
  }
  flush(paragraphs.length - 1);

  return passages;
}
