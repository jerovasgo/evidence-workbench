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
const SECTION_HEADING = /^(?:abstract|intro(?:duction)?|background|methods?|materials and methods|results?|discussion|conclusions?)$/i;

export function beginsResearchSection(text: string): boolean {
  return SECTION_HEADING.test(text.split(/\n\s*\n/)[0]?.trim() ?? '');
}

function wordCount(text: string): number {
  return text.split(/\s+/).filter((w) => w.length > 0).length;
}

function splitParagraphs(text: string): string[] {
  return text
    .split(/\n\s*\n+/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0)
    .flatMap((paragraph) => {
      if (wordCount(paragraph) <= MAX_WORDS_PER_WINDOW) return [paragraph];
      // JATS and HTML extraction can still yield an oversized paragraph. Split
      // at sentence boundaries first, and only at words when a single sentence
      // exceeds the window budget. Each resulting span keeps an auditable locator.
      const sentences = paragraph.match(/[^.!?]+[.!?]+(?:\s+|$)|[^.!?]+$/g)?.map((s) => s.trim()).filter(Boolean) ?? [paragraph];
      const chunks: string[] = [];
      let current = '';
      for (const sentence of sentences) {
        const pieces = wordCount(sentence) > MAX_WORDS_PER_WINDOW
          ? sentence.split(/\s+/).reduce<string[]>((parts, word) => {
              if (!parts.length || wordCount(parts[parts.length - 1]!) >= MAX_WORDS_PER_WINDOW) parts.push(word);
              else parts[parts.length - 1] += ` ${word}`;
              return parts;
            }, [])
          : [sentence];
        for (const piece of pieces) {
          if (current && wordCount(current) + wordCount(piece) > MAX_WORDS_PER_WINDOW) {
            chunks.push(current);
            current = '';
          }
          current = current ? `${current} ${piece}` : piece;
        }
      }
      if (current) chunks.push(current);
      return chunks;
    });
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

    if (SECTION_HEADING.test(paragraph) && windowParagraphs.length > 0) {
      flush(i - 1);
      windowStart = i;
    }

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
