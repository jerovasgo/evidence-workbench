import { describe, expect, it } from 'vitest';
import { assertSafeUrl } from '@/shared/security';
import { DEFAULT_ALLOWED_DOMAIN_NAMES, DEFAULT_ALLOWED_DOMAINS } from './default-allowed-domains';

describe('DEFAULT_ALLOWED_DOMAINS', () => {
  it('has a non-empty, deduplicated list with a reason for every entry', () => {
    expect(DEFAULT_ALLOWED_DOMAINS.length).toBeGreaterThan(0);
    expect(new Set(DEFAULT_ALLOWED_DOMAIN_NAMES).size).toBe(DEFAULT_ALLOWED_DOMAIN_NAMES.length);
    for (const entry of DEFAULT_ALLOWED_DOMAINS) {
      expect(entry.reason.length).toBeGreaterThan(0);
    }
  });

  it('every domain is accepted by assertSafeUrl for a plausible https URL', () => {
    for (const domain of DEFAULT_ALLOWED_DOMAIN_NAMES) {
      expect(() => assertSafeUrl(`https://${domain}/some/gene-page`, DEFAULT_ALLOWED_DOMAIN_NAMES)).not.toThrow();
    }
  });

  it('accepts a subdomain of an allow-listed apex domain', () => {
    expect(() => assertSafeUrl('https://www.ncbi.nlm.nih.gov/gene/7157', DEFAULT_ALLOWED_DOMAIN_NAMES)).not.toThrow();
  });
});
