import { assertSafeUrl } from '@/shared/security';
import { extractReadableText } from './html-text';

// Module 02 `fetch_url_text` tool: fetch an allow-listed guideline/society page and
// return its readable text. Module 10: "URL-checked ... no redirects to disallowed
// hosts" — each redirect hop is re-checked against the same allow-list, and the
// response body is read under a hard byte cap regardless of what Content-Length claims.

export interface FetchUrlTextOptions {
  allowedDomains: readonly string[];
  fetchImpl?: typeof fetch;
  maxBytes?: number;
  maxRedirects?: number;
}

export interface FetchUrlTextResult {
  finalUrl: string;
  status: number;
  contentType: string;
  text: string;
  truncated: boolean;
}

const DEFAULT_MAX_BYTES = 2_000_000;
const DEFAULT_MAX_REDIRECTS = 5;

export async function fetchUrlText(rawUrl: string, options: FetchUrlTextOptions): Promise<FetchUrlTextResult> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
  const maxRedirects = options.maxRedirects ?? DEFAULT_MAX_REDIRECTS;

  let currentUrl = assertSafeUrl(rawUrl, options.allowedDomains);

  for (let hop = 0; hop <= maxRedirects; hop++) {
    const res = await fetchImpl(currentUrl.toString(), { redirect: 'manual' });

    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get('location');
      if (!location) {
        throw new Error(`Redirect (HTTP ${res.status}) from ${currentUrl.toString()} had no Location header`);
      }
      currentUrl = assertSafeUrl(new URL(location, currentUrl).toString(), options.allowedDomains);
      continue;
    }

    const contentType = res.headers.get('content-type') ?? '';
    const { text: rawText, truncated } = await readBodyWithCap(res, maxBytes);
    return {
      finalUrl: currentUrl.toString(),
      status: res.status,
      contentType,
      text: extractReadableText(rawText, contentType),
      truncated,
    };
  }

  throw new Error(`Too many redirects (> ${maxRedirects}) fetching ${rawUrl}`);
}

async function readBodyWithCap(res: Response, maxBytes: number): Promise<{ text: string; truncated: boolean }> {
  if (!res.body) {
    const text = await res.text();
    return { text: text.slice(0, maxBytes), truncated: text.length > maxBytes };
  }

  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  let truncated = false;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;

    if (total + value.length > maxBytes) {
      chunks.push(value.slice(0, maxBytes - total));
      truncated = true;
      await reader.cancel();
      break;
    }
    chunks.push(value);
    total += value.length;
  }

  const buffer = Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)));
  return { text: buffer.toString('utf8'), truncated };
}
