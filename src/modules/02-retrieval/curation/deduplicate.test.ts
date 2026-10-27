import { describe, expect, it } from 'vitest';
import type { CandidateSource } from '../schemas/retrieval';
import { deduplicateCandidates } from './deduplicate';

function candidate(overrides: Partial<CandidateSource> & { tempId: string; title: string; url: string }): CandidateSource {
  return { family: 'pubmed', ...overrides };
}

describe('deduplicateCandidates', () => {
  it('merges two records with the same DOI (different formatting), keeping the richer one', () => {
    const a = candidate({ tempId: 'a', title: 'Guideline', url: 'https://a.example.org', doi: 'https://doi.org/10.1/X' });
    const b = candidate({
      tempId: 'b',
      title: 'Guideline',
      url: 'https://b.example.org',
      doi: '10.1/x',
      issuer: 'AHA',
      year: 2023,
    });
    expect(deduplicateCandidates([a, b])).toEqual([b]);
  });

  it('merges two records with the same PMID', () => {
    const a = candidate({ tempId: 'a', title: 'x', url: 'https://a.example.org', pmid: 'PMID: 123' });
    const b = candidate({ tempId: 'b', title: 'x', url: 'https://b.example.org', pmid: '123', issuer: 'AHA' });
    expect(deduplicateCandidates([a, b])).toHaveLength(1);
  });

  it('merges by normalized title + first author + year when no doi/pmid is present', () => {
    const a = candidate({ tempId: 'a', title: '  Chest Pain Guideline  ', firstAuthor: 'Smith', year: 2023, url: 'https://a.example.org' });
    const b = candidate({
      tempId: 'b',
      title: 'chest pain guideline',
      firstAuthor: 'smith',
      year: 2023,
      url: 'https://b.example.org',
      issuer: 'AHA',
    });
    expect(deduplicateCandidates([a, b])).toHaveLength(1);
  });

  it('keeps distinct sources that share nothing in common', () => {
    const a = candidate({ tempId: 'a', title: 'Guideline A', url: 'https://a.example.org', doi: '10.1/a' });
    const b = candidate({ tempId: 'b', title: 'Guideline B', url: 'https://b.example.org', doi: '10.1/b' });
    expect(deduplicateCandidates([a, b])).toHaveLength(2);
  });

  it('does not merge different years of the same title (different editions are not duplicates here)', () => {
    const a = candidate({ tempId: 'a', title: 'Guideline', firstAuthor: 'Smith', year: 2018, url: 'https://a.example.org' });
    const b = candidate({ tempId: 'b', title: 'Guideline', firstAuthor: 'Smith', year: 2023, url: 'https://b.example.org' });
    expect(deduplicateCandidates([a, b])).toHaveLength(2);
  });
});
