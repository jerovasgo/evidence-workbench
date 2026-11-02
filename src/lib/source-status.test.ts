import { describe, expect, it } from 'vitest';
import { computeSourceRegistry } from './source-status';

const catalog = {
  s1: { id: 's1', title: 'Included source', url: 'https://example.com/s1' },
  s2: { id: 's2', title: 'No full text source', url: 'https://example.com/s2' },
  s3: { id: 's3', title: 'Extraction failed source', url: 'https://example.com/s3' },
  s4: { id: 's4', title: 'Withdrawn source', url: 'https://example.com/s4' },
  s5: { id: 's5', title: 'No findings source', url: 'https://example.com/s5' },
  s6: { id: 's6', title: 'Currently evaluating source', url: 'https://example.com/s6' },
  s7: { id: 's7', title: 'Not yet reached source', url: 'https://example.com/s7' },
};

describe('computeSourceRegistry', () => {
  it('classifies every source correctly while a run is streaming', () => {
    const { entries, summary } = computeSourceRegistry(
      catalog,
      ['s1: ok, 2 claim(s)', 's2: no_full_text', 's3: extraction_failed', 's4: ok, 1 claim(s)', 's5: ok'],
      [{ sourceId: 's1' }, { sourceId: 's1' }],
      [{ sourceId: 's4', count: 1, reason: 'retraction status unknown' }],
      { s6: [{}] },
      true,
    );

    const byId = Object.fromEntries(entries.map((entry) => [entry.id, entry]));
    expect(byId.s1).toMatchObject({ status: 'included', claimsExtracted: 2 });
    expect(byId.s2).toMatchObject({ status: 'excluded', reason: 'Full text could not be accessed.' });
    expect(byId.s3).toMatchObject({ status: 'excluded', reason: 'Extraction failed.' });
    expect(byId.s4).toMatchObject({ status: 'excluded', reason: 'retraction status unknown' });
    expect(byId.s5).toMatchObject({ status: 'excluded', reason: 'No verifiable finding was extracted from this source.' });
    expect(byId.s6).toMatchObject({ status: 'evaluated' });
    expect(byId.s7).toMatchObject({ status: 'pending_evaluation' });

    expect(summary).toEqual({ identified: 0, pendingEvaluation: 1, evaluated: 1, included: 1, excluded: 4 });
  });

  it('treats a source never reached by the time the run finished as identified, not pending', () => {
    const { entries } = computeSourceRegistry(catalog, [], [], [], {}, false);
    expect(entries.every((entry) => entry.status === 'identified')).toBe(true);
  });

  it('a source with a real verified claim is always included, even if it also appears withdrawn for other claims', () => {
    const { entries } = computeSourceRegistry(
      { s1: catalog.s1 },
      ['s1: ok, 1 claim(s)'],
      [{ sourceId: 's1' }],
      [{ sourceId: 's1', count: 1, reason: 'one claim withdrawn' }],
      {},
      false,
    );
    expect(entries[0]).toMatchObject({ status: 'included', claimsExtracted: 1 });
  });
});
