import { describe, expect, it } from 'vitest';
import { assertSafeUrl, UnsafeUrlError } from './url-guard';

const ALLOWED = ['guidelines.example.org', 'cdc.gov'];

describe('assertSafeUrl', () => {
  it('accepts an https URL on the allow-list', () => {
    const url = assertSafeUrl('https://guidelines.example.org/chest-pain', ALLOWED);
    expect(url.hostname).toBe('guidelines.example.org');
  });

  it('accepts a subdomain of an allow-listed domain', () => {
    expect(() => assertSafeUrl('https://www.cdc.gov/page', ALLOWED)).not.toThrow();
  });

  it('rejects http (non-https)', () => {
    expect(() => assertSafeUrl('http://guidelines.example.org/page', ALLOWED)).toThrow(UnsafeUrlError);
  });

  it('rejects a host not on the allow-list', () => {
    expect(() => assertSafeUrl('https://evil.example.com/page', ALLOWED)).toThrow(/not on the allow-list/);
  });

  it('rejects localhost even if somehow allow-listed', () => {
    expect(() => assertSafeUrl('https://localhost/admin', ['localhost'])).toThrow(/private\/loopback/);
  });

  it('rejects a private IPv4 literal even if somehow allow-listed', () => {
    expect(() => assertSafeUrl('https://10.0.0.5/admin', ['10.0.0.5'])).toThrow(/private\/loopback/);
    expect(() => assertSafeUrl('https://192.168.1.1/admin', ['192.168.1.1'])).toThrow(/private\/loopback/);
  });

  it('rejects a malformed URL string', () => {
    expect(() => assertSafeUrl('not a url', ALLOWED)).toThrow(/Not a valid URL/);
  });
});
