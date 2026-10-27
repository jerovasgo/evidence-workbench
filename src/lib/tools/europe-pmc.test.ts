import { describe, expect, it, vi } from 'vitest';
import { createEuropePmcClient } from './europe-pmc';

// Fixture shape recorded live from the real Europe PMC REST search endpoint on
// 2026-10-27: pubType is a single "; "-separated string, not a pubTypeList.pubType array.
const SEARCH_FIXTURE = {
  hitCount: 1,
  resultList: {
    result: [
      {
        id: '36456988',
        source: 'MED',
        pmid: '36456988',
        doi: '10.1161/CIR.0000000000001098',
        title: '2022 AHA/ACC/HFSA Guideline for the Management of Heart Failure',
        authorString: 'Heidenreich PA, Bozkurt B, et al.',
        pubYear: '2022',
        isOpenAccess: 'Y',
        pubType: 'research-article; review-article',
      },
    ],
  },
};

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
}

describe('createEuropePmcClient.search', () => {
  it('maps the search fixture, converting pubYear to a number and isOpenAccess to a boolean', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(SEARCH_FIXTURE));
    const client = createEuropePmcClient({ fetchImpl });

    const [result] = await client.search('heart failure guideline');
    expect(result).toEqual({
      id: '36456988',
      source: 'MED',
      pmid: '36456988',
      doi: '10.1161/CIR.0000000000001098',
      title: '2022 AHA/ACC/HFSA Guideline for the Management of Heart Failure',
      authorString: 'Heidenreich PA, Bozkurt B, et al.',
      pubYear: 2022,
      isOpenAccess: true,
      pubTypes: ['research-article', 'review-article'],
    });
  });

  it('throws on a non-2xx response', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('error', { status: 500 }));
    const client = createEuropePmcClient({ fetchImpl });
    await expect(client.search('x')).rejects.toThrow(/HTTP 500/);
  });

  it('also accepts the older pubTypeList.pubType array shape, if the API ever returns it', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({
        resultList: {
          result: [{ id: '1', source: 'MED', title: 'x', pubTypeList: { pubType: ['review-article'] } }],
        },
      }),
    );
    const client = createEuropePmcClient({ fetchImpl });
    const [result] = await client.search('x');
    expect(result?.pubTypes).toEqual(['review-article']);
  });
});

describe('createEuropePmcClient.fetchFullText', () => {
  it('strips XML tags from the fullTextXML response', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(
        new Response('<article><body><p>Spironolactone reduces mortality.</p></body></article>', {
          status: 200,
          headers: { 'content-type': 'application/xml' },
        }),
      );
    const client = createEuropePmcClient({ fetchImpl });
    const text = await client.fetchFullText('MED', '36456988');
    expect(text).toBe('Spironolactone reduces mortality.');
  });

  it('returns null (not a throw) when the article has no full text available', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('not found', { status: 404 }));
    const client = createEuropePmcClient({ fetchImpl });
    expect(await client.fetchFullText('MED', '00000000')).toBeNull();
  });
});
