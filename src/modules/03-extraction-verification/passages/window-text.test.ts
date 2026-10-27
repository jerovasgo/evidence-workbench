import { describe, expect, it } from 'vitest';
import { windowText } from './window-text';

describe('windowText', () => {
  it('returns no passages for empty text', () => {
    expect(windowText('src_1', '')).toEqual([]);
  });

  it('returns a single passage for short text', () => {
    const passages = windowText('src_1', 'Paragraph one.\n\nParagraph two.');
    expect(passages).toHaveLength(1);
    expect(passages[0]).toMatchObject({ id: 'src_1:0', sourceId: 'src_1', locator: '¶1-2' });
    expect(passages[0]!.text).toContain('Paragraph one.');
    expect(passages[0]!.text).toContain('Paragraph two.');
  });

  it('splits into multiple windows once the word budget is exceeded', () => {
    const bigParagraph = Array.from({ length: 700 }, (_, i) => `word${i}`).join(' ');
    const text = [bigParagraph, bigParagraph, bigParagraph].join('\n\n');

    const passages = windowText('src_1', text);

    expect(passages.length).toBeGreaterThan(1);
    expect(passages[0]!.locator).toBe('¶1');
    expect(passages[1]!.locator).toBe('¶2');
  });

  it('keeps a single oversized paragraph whole rather than splitting it', () => {
    const hugeParagraph = Array.from({ length: 2000 }, (_, i) => `word${i}`).join(' ');
    const passages = windowText('src_1', hugeParagraph);
    expect(passages).toHaveLength(1);
    expect(passages[0]!.text).toBe(hugeParagraph);
  });

  it('assigns distinct, sequential passage ids', () => {
    const bigParagraph = Array.from({ length: 700 }, (_, i) => `word${i}`).join(' ');
    const passages = windowText('src_42', [bigParagraph, bigParagraph].join('\n\n'));
    expect(passages.map((p) => p.id)).toEqual(['src_42:0', 'src_42:1']);
  });
});
