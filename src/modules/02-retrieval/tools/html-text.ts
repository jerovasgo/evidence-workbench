// Minimal HTML-to-text extraction for guideline pages (module 02: "PDFs parsed to
// text with page locators" is NOT implemented here — PDF support is a follow-up).
// Deliberately simple: strip script/style/comments, strip remaining tags, decode the
// handful of entities that actually show up in prose. Not a general HTML parser.

const ENTITY_REPLACEMENTS: [RegExp, string][] = [
  [/&nbsp;/gi, ' '],
  [/&amp;/gi, '&'],
  [/&lt;/gi, '<'],
  [/&gt;/gi, '>'],
  [/&quot;/gi, '"'],
  [/&#39;|&apos;/gi, "'"],
];

export function extractReadableText(raw: string, contentType: string): string {
  const lowerType = contentType.toLowerCase();
  if (!lowerType.includes('html') && !lowerType.includes('xml')) {
    return raw.trim();
  }

  let text = raw
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    // Keep JATS/HTML section and paragraph boundaries. Collapsing all whitespace
    // made an entire article one oversized extraction passage.
    .replace(/<\/(?:p|title|h[1-6]|sec|abstract|section|li|table-wrap)>/gi, '\n\n')
    .replace(/<br\s*\/?\s*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ');

  for (const [pattern, replacement] of ENTITY_REPLACEMENTS) {
    text = text.replace(pattern, replacement);
  }

  return text
    .replace(/[^\S\n]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
