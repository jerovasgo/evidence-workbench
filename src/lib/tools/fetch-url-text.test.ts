import { describe, expect, it, vi } from 'vitest';
import { UnsafeUrlError } from '../security/url-guard';
import { fetchUrlText } from './fetch-url-text';

const ALLOWED = ['guidelines.example.org'];

function htmlResponse(status: number, html: string, headers: Record<string, string> = {}): Response {
  return new Response(html, { status, headers: { 'content-type': 'text/html', ...headers } });
}

describe('fetchUrlText', () => {
  it('fetches an allowed URL and returns its readable text', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(htmlResponse(200, '<p>Give aspirin 325mg.</p>'));
    const result = await fetchUrlText('https://guidelines.example.org/chest-pain', {
      allowedDomains: ALLOWED,
      fetchImpl,
    });
    expect(result.status).toBe(200);
    expect(result.text).toBe('Give aspirin 325mg.');
    expect(result.truncated).toBe(false);
  });

  it('refuses a URL not on the allow-list without ever calling fetch', async () => {
    const fetchImpl = vi.fn();
    await expect(
      fetchUrlText('https://evil.example.com/page', { allowedDomains: ALLOWED, fetchImpl }),
    ).rejects.toThrow(UnsafeUrlError);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('follows a redirect to another allowed host', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(null, { status: 302, headers: { location: 'https://guidelines.example.org/final' } }),
      )
      .mockResolvedValueOnce(htmlResponse(200, '<p>Final page</p>'));

    const result = await fetchUrlText('https://guidelines.example.org/start', {
      allowedDomains: ALLOWED,
      fetchImpl,
    });
    expect(result.finalUrl).toBe('https://guidelines.example.org/final');
    expect(result.text).toBe('Final page');
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('refuses a redirect that points to a host not on the allow-list', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 302, headers: { location: 'https://evil.example.com/x' } }));

    await expect(
      fetchUrlText('https://guidelines.example.org/start', { allowedDomains: ALLOWED, fetchImpl }),
    ).rejects.toThrow(UnsafeUrlError);
  });

  it('truncates a response body over the byte cap and marks truncated', async () => {
    const bigText = 'a'.repeat(100);
    const fetchImpl = vi.fn().mockResolvedValue(new Response(bigText, { status: 200, headers: { 'content-type': 'text/plain' } }));

    const result = await fetchUrlText('https://guidelines.example.org/big', {
      allowedDomains: ALLOWED,
      fetchImpl,
      maxBytes: 10,
    });
    expect(result.truncated).toBe(true);
    expect(result.text.length).toBeLessThanOrEqual(10);
  });

  it('throws after exceeding the redirect limit', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 302, headers: { location: 'https://guidelines.example.org/loop' } }));

    await expect(
      fetchUrlText('https://guidelines.example.org/loop', { allowedDomains: ALLOWED, fetchImpl, maxRedirects: 2 }),
    ).rejects.toThrow(/Too many redirects/);
  });
});
