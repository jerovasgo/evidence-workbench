// Module 10 SSRF guard: "https, allow-list for guideline domains, no private IP
// ranges, no redirects to disallowed hosts". The allow-list is the primary defence
// (arbitrary internal hosts are simply never on it); the private-hostname check below
// is defense in depth against an allow-listed name that somehow points at a private
// address, and does NOT re-resolve DNS at fetch time — a DNS-rebinding attack where an
// allow-listed hostname's A record changes between this check and the actual fetch is
// a known, documented gap (see SECURITY.md), not something this function can close
// without the caller pinning the resolved IP for the connection itself.

export class UnsafeUrlError extends Error {}

const PRIVATE_HOSTNAME_PATTERNS: RegExp[] = [
  /^localhost$/i,
  /^127\./,
  /^0\.0\.0\.0$/,
  /^10\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  /^169\.254\./,
  /^\[?::1\]?$/,
  /^\[?fc[0-9a-f]{2}:/i,
  /^\[?fe80:/i,
];

/**
 * Throws UnsafeUrlError unless `rawUrl` is https, not a private/loopback hostname, and
 * on (or a subdomain of) one of `allowedDomains`. Returns the parsed URL so callers
 * don't have to re-parse it.
 */
export function assertSafeUrl(rawUrl: string, allowedDomains: readonly string[]): URL {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new UnsafeUrlError(`Not a valid URL: ${rawUrl}`);
  }

  if (url.protocol !== 'https:') {
    throw new UnsafeUrlError(`Only https URLs are allowed, got "${url.protocol}" for ${rawUrl}`);
  }

  if (PRIVATE_HOSTNAME_PATTERNS.some((pattern) => pattern.test(url.hostname))) {
    throw new UnsafeUrlError(`Refusing to fetch a private/loopback host: ${url.hostname}`);
  }

  const isAllowed = allowedDomains.some(
    (domain) => url.hostname === domain || url.hostname.endsWith(`.${domain}`),
  );
  if (!isAllowed) {
    throw new UnsafeUrlError(`Host "${url.hostname}" is not on the allow-list`);
  }

  return url;
}
