import { describe, expect, it, vi } from 'vitest';
import type { CrossrefClient } from '@/modules/02-retrieval';
import type { PubmedClient } from '@/modules/02-retrieval';
import { checkSourceExists } from './existence';

function deps(overrides: Partial<{ crossref: CrossrefClient; pubmed: PubmedClient; checkUrlReachable: (url: string) => Promise<{ status: number }> }> = {}) {
  return {
    crossref: { lookup: vi.fn(async () => null) },
    pubmed: { search: vi.fn(), fetchSummaries: vi.fn(async () => []) },
    checkUrlReachable: vi.fn(async () => ({ status: 200 })),
    ...overrides,
  };
}

describe('checkSourceExists', () => {
  it('checks by DOI when present, and never touches PubMed or the URL', async () => {
    const d = deps({ crossref: { lookup: vi.fn(async () => ({ doi: '10.1/x', retracted: false, updateNotices: [] })) } });
    const result = await checkSourceExists({ doi: '10.1/x', url: 'https://example.org' }, d);
    expect(result).toEqual({ exists: true, method: 'doi' });
    expect(d.pubmed.fetchSummaries).not.toHaveBeenCalled();
    expect(d.checkUrlReachable).not.toHaveBeenCalled();
  });

  it('reports exists:false with a reason when the DOI does not resolve', async () => {
    const d = deps();
    const result = await checkSourceExists({ doi: '10.9/missing', url: 'https://example.org' }, d);
    expect(result).toEqual({ exists: false, method: 'doi', reason: expect.stringContaining('10.9/missing') });
  });

  it('checks by PMID when no DOI is given', async () => {
    const d = deps({ pubmed: { search: vi.fn(), fetchSummaries: vi.fn(async () => [{ pmid: '123', title: 'x', pubTypes: [] }]) } });
    const result = await checkSourceExists({ pmid: '123', url: 'https://example.org' }, d);
    expect(result).toEqual({ exists: true, method: 'pmid' });
  });

  it('falls back to a URL reachability check when neither DOI nor PMID is given', async () => {
    const d = deps({ checkUrlReachable: vi.fn(async () => ({ status: 200 })) });
    const result = await checkSourceExists({ url: 'https://example.org/page' }, d);
    expect(result).toEqual({ exists: true, method: 'url' });
  });

  it('reports exists:false when the URL returns a non-2xx status', async () => {
    const d = deps({ checkUrlReachable: vi.fn(async () => ({ status: 404 })) });
    const result = await checkSourceExists({ url: 'https://example.org/gone' }, d);
    expect(result).toEqual({ exists: false, method: 'url', reason: expect.stringContaining('404') });
  });
});
