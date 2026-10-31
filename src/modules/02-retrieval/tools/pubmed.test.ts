import { describe, expect, it, vi } from 'vitest';
import { createRateLimiter } from './rate-limiter';
import { createPubmedClient } from './pubmed';
import { createTtlCache } from './ttl-cache';

// Fixture shapes recorded from real NCBI E-utilities responses (module 02 build note:
// "Connectors first with recorded fixtures (VCR-style) so tests run offline").
const ESEARCH_FIXTURE = {
  esearchresult: { count: '2', retmax: '2', retstart: '0', idlist: ['12345678', '23456789'] },
};

const ESUMMARY_FIXTURE = {
  result: {
    uids: ['12345678'],
    '12345678': {
      uid: '12345678',
      pubdate: '2023 Jan',
      source: 'Circulation',
      fulljournalname: 'Circulation',
      title: '2023 Guideline for the Management of Chest Pain',
      pubtype: ['Journal Article', 'Practice Guideline'],
      articleids: [{ idtype: 'doi', idtypen: 3, value: '10.1161/CIR.0000000000001234' }],
    },
  },
};

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
}

function immediateRateLimiter() {
  return createRateLimiter(1000, 1000, () => 0, async () => {});
}

describe('createPubmedClient.search', () => {
  it('parses idlist from the esearch fixture', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(ESEARCH_FIXTURE));
    const client = createPubmedClient({ fetchImpl, rateLimiter: immediateRateLimiter() });

    const result = await client.search('chest pain guideline');
    expect(result.pmids).toEqual(['12345678', '23456789']);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect((fetchImpl.mock.calls[0]?.[0] as string)).toContain('esearch.fcgi');
    expect(new URL(fetchImpl.mock.calls[0]?.[0] as string).searchParams.get('sort')).toBe('relevance');
  });

  it('caches identical searches and does not call fetch again', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(ESEARCH_FIXTURE));
    const cache = createTtlCache<unknown>(60_000);
    const client = createPubmedClient({ fetchImpl, rateLimiter: immediateRateLimiter(), cache });

    await client.search('chest pain guideline');
    await client.search('chest pain guideline');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('throws when the API responds with a non-2xx status', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('error', { status: 500 }));
    const client = createPubmedClient({ fetchImpl, rateLimiter: immediateRateLimiter() });
    await expect(client.search('x')).rejects.toThrow(/HTTP 500/);
  });
});

describe('createPubmedClient.fetchSummaries', () => {
  it('maps esummary fields, including the publication-type array source-classifier needs', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(ESUMMARY_FIXTURE));
    const client = createPubmedClient({ fetchImpl, rateLimiter: immediateRateLimiter() });

    const [summary] = await client.fetchSummaries(['12345678']);
    expect(summary).toEqual({
      pmid: '12345678',
      title: '2023 Guideline for the Management of Chest Pain',
      journal: 'Circulation',
      pubDate: '2023 Jan',
      pubTypes: ['Journal Article', 'Practice Guideline'],
      doi: '10.1161/CIR.0000000000001234',
    });
  });

  it('returns an empty array for an empty pmid list without calling fetch', async () => {
    const fetchImpl = vi.fn();
    const client = createPubmedClient({ fetchImpl, rateLimiter: immediateRateLimiter() });
    expect(await client.fetchSummaries([])).toEqual([]);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('only fetches the pmids not already cached', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(ESUMMARY_FIXTURE));
    const cache = createTtlCache<unknown>(60_000);
    const client = createPubmedClient({ fetchImpl, rateLimiter: immediateRateLimiter(), cache });

    await client.fetchSummaries(['12345678']);
    await client.fetchSummaries(['12345678']);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
