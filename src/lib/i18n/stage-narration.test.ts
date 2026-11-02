import { describe, expect, it } from 'vitest';
import { narrateSourceProgress, narrateStageResult } from './stage-narration';
import type { StageName, StageState } from '@/lib/use-run-stream';

const STAGES: StageName[] = ['structure', 'plan', 'retrieve', 'classify', 'extract'];
const STATUSES: StageState['status'][] = ['pending', 'running', 'ok', 'partial', 'abstain', 'failed'];

describe('narrateStageResult', () => {
  for (const stage of STAGES) {
    for (const status of STATUSES) {
      it(`produces a non-empty sentence for (${stage}, ${status})`, () => {
        expect(narrateStageResult(stage, status).length).toBeGreaterThan(0);
      });
    }
  }
});

describe('narrateSourceProgress', () => {
  const sourceCatalog = { 'europe_pmc:MED:42519825': { title: 'A real paper title' } };

  it('resolves a known source id with claims found', () => {
    expect(narrateSourceProgress('europe_pmc:MED:42519825: ok, 2 claim(s)', sourceCatalog)).toBe(
      'Verified 2 findings in "A real paper title".',
    );
  });

  it('resolves a known source id with a single claim (singular wording)', () => {
    expect(narrateSourceProgress('europe_pmc:MED:42519825: ok, 1 claim(s)', sourceCatalog)).toBe(
      'Verified 1 finding in "A real paper title".',
    );
  });

  it('resolves ok with no claims', () => {
    expect(narrateSourceProgress('europe_pmc:MED:42519825: ok', sourceCatalog)).toBe(
      'Read "A real paper title" — no usable findings there.',
    );
  });

  it('resolves no_full_text', () => {
    expect(narrateSourceProgress('europe_pmc:MED:42519825: no_full_text', sourceCatalog)).toBe(
      'Could not access the full text of "A real paper title".',
    );
  });

  it('resolves extraction_failed', () => {
    expect(narrateSourceProgress('europe_pmc:MED:42519825: extraction_failed', sourceCatalog)).toBe(
      'Could not extract findings from "A real paper title".',
    );
  });

  it('falls back to the raw source id when the catalog has no title for it', () => {
    expect(narrateSourceProgress('unknown_id: ok, 3 claim(s)', {})).toBe('Verified 3 findings in "unknown_id".');
  });

  it('returns an unrecognized string unchanged rather than throwing', () => {
    expect(narrateSourceProgress('this is not the expected shape', sourceCatalog)).toBe('this is not the expected shape');
    expect(() => narrateSourceProgress('', sourceCatalog)).not.toThrow();
  });
});
