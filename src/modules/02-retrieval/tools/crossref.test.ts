import { describe, expect, it, vi } from 'vitest';
import { createCrossrefClient, normalizeDoi } from './crossref';

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
}

describe('normalizeDoi', () => {
  it('strips a doi.org URL prefix and lower-cases', () => {
    expect(normalizeDoi('https://doi.org/10.1161/CIR.0000000000001098')).toBe('10.1161/cir.0000000000001098');
    expect(normalizeDoi('http://dx.doi.org/10.1000/ABC')).toBe('10.1000/abc');
  });

  it('leaves a bare DOI as-is except for lower-casing', () => {
    expect(normalizeDoi('10.1000/ABC')).toBe('10.1000/abc');
  });
});

describe('createCrossrefClient.lookup', () => {
  it('returns a non-retracted work with no update-to entries', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({
        message: {
          DOI: '10.1161/cir.0000000000001098',
          title: ['2022 Heart Failure Guideline'],
          issued: { 'date-parts': [[2022, 4, 1]] },
        },
      }),
    );
    const client = createCrossrefClient({ fetchImpl });

    const work = await client.lookup('10.1161/CIR.0000000000001098');
    expect(work).toEqual({
      doi: '10.1161/cir.0000000000001098',
      title: '2022 Heart Failure Guideline',
      issued: '2022-4-1',
      retracted: false,
      updateNotices: [],
    });
  });

  it('flags a work as retracted when update-to contains a retraction notice', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({
        message: {
          DOI: '10.1000/retracted-paper',
          title: ['A withdrawn finding'],
          'update-to': [{ type: 'Retraction', DOI: '10.1000/retraction-notice', updated: { 'date-time': '2024-01-01T00:00:00Z' } }],
        },
      }),
    );
    const client = createCrossrefClient({ fetchImpl });

    const work = await client.lookup('10.1000/retracted-paper');
    expect(work?.retracted).toBe(true);
    expect(work?.updateNotices).toEqual([
      { type: 'retraction', doi: '10.1000/retraction-notice', updated: '2024-01-01T00:00:00Z' },
    ]);
  });

  it('returns null (not a throw) for a DOI that does not resolve', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('not found', { status: 404 }));
    const client = createCrossrefClient({ fetchImpl });
    expect(await client.lookup('10.9999/does-not-exist')).toBeNull();
  });

  it('throws on an unexpected non-2xx, non-404 response', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('error', { status: 500 }));
    const client = createCrossrefClient({ fetchImpl });
    await expect(client.lookup('10.1000/x')).rejects.toThrow(/HTTP 500/);
  });

  it('includes the mailto param when configured (Crossref polite pool)', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ message: { DOI: '10.1000/x' } }));
    const client = createCrossrefClient({ fetchImpl, mailto: 'team@example.org' });
    await client.lookup('10.1000/x');
    expect((fetchImpl.mock.calls[0]?.[0] as string)).toContain('mailto=team%40example.org');
  });
});
