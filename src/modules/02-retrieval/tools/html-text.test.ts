import { describe, expect, it } from 'vitest';
import { extractReadableText } from './html-text';

describe('extractReadableText', () => {
  it('strips tags, scripts, styles, and comments from HTML', () => {
    const html = `
      <html><head><style>.x{color:red}</style><script>alert(1)</script></head>
      <body><!-- note -->
        <h1>Chest pain guideline</h1>
        <p>Give aspirin 325&nbsp;mg &amp; call 911.</p>
      </body></html>`;
    expect(extractReadableText(html, 'text/html; charset=utf-8')).toBe(
      'Chest pain guideline\n\nGive aspirin 325 mg & call 911.',
    );
  });

  it('decodes common entities', () => {
    expect(extractReadableText('&lt;b&gt;bold&lt;/b&gt; &quot;quote&quot; &#39;s', 'text/html')).toBe(
      '<b>bold</b> "quote" \'s',
    );
  });

  it('leaves plain text untouched aside from trimming', () => {
    expect(extractReadableText('  plain text  ', 'text/plain')).toBe('plain text');
  });

  it('also strips tags from XML (e.g. Europe PMC fullTextXML / JATS)', () => {
    const xml = '<article><body><p>Receptor binds ligand.</p></body></article>';
    expect(extractReadableText(xml, 'application/xml')).toBe('Receptor binds ligand.');
  });

  it('retains article section boundaries for bounded extraction windows', () => {
    const xml = '<article><sec><title>Methods</title><p>Cells were edited.</p></sec><sec><title>Results</title><p>Expression increased.</p></sec></article>';
    expect(extractReadableText(xml, 'application/xml')).toBe('Methods\n\nCells were edited.\n\nResults\n\nExpression increased.');
  });
});
