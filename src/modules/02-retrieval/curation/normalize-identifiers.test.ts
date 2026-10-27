import { describe, expect, it } from 'vitest';
import { normalizeDoi, normalizePmid, normalizeUrl } from './normalize-identifiers';

describe('normalizeDoi (re-exported from tools/crossref)', () => {
  it('strips a doi.org prefix and lower-cases', () => {
    expect(normalizeDoi('https://doi.org/10.1161/CIR.123')).toBe('10.1161/cir.123');
  });
});

describe('normalizeUrl', () => {
  it('lower-cases the host and drops the fragment', () => {
    expect(normalizeUrl('https://WWW.Example.ORG/page#section-2')).toBe('https://www.example.org/page');
  });

  it('removes tracking query params but keeps meaningful ones', () => {
    expect(normalizeUrl('https://example.org/page?id=42&utm_source=twitter&fbclid=abc')).toBe(
      'https://example.org/page?id=42',
    );
  });

  it('drops a trailing slash on a non-root path', () => {
    expect(normalizeUrl('https://example.org/guideline/')).toBe('https://example.org/guideline');
  });

  it('keeps the root path slash', () => {
    expect(normalizeUrl('https://example.org/')).toBe('https://example.org/');
  });

  it('returns a malformed URL trimmed, without throwing', () => {
    expect(normalizeUrl('  not a url  ')).toBe('not a url');
  });
});

describe('normalizePmid', () => {
  it('strips a "PMID:" label and whitespace', () => {
    expect(normalizePmid('PMID: 12345678')).toBe('12345678');
    expect(normalizePmid('  12345678  ')).toBe('12345678');
  });
});
