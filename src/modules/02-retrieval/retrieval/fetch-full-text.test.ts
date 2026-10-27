import { describe, expect, it, vi } from 'vitest';
import type { EuropePmcClient } from '../tools/europe-pmc';
import type { CandidateSource } from '../schemas/retrieval';
import { fetchFullTextForCandidate } from './fetch-full-text';

function fakeEuropePmc(overrides: Partial<EuropePmcClient> = {}): EuropePmcClient {
  return { search: vi.fn(), fetchFullText: vi.fn().mockResolvedValue(null), ...overrides };
}

const baseEuropePmcCandidate: CandidateSource = {
  tempId: 'europe_pmc:PMC:PMC123',
  family: 'europe_pmc',
  title: 'A trial',
  url: 'https://europepmc.org/article/PMC/PMC123',
};

const basePubmedCandidate: CandidateSource = {
  tempId: 'pubmed:111',
  family: 'pubmed',
  title: 'A guideline',
  pmid: '111',
  url: 'https://pubmed.ncbi.nlm.nih.gov/111/',
};

describe('fetchFullTextForCandidate', () => {
  it('fetches by the (source, id) pair recovered from an europe_pmc tempId', async () => {
    const europePmc = fakeEuropePmc({ fetchFullText: vi.fn().mockResolvedValue('full text here') });
    const result = await fetchFullTextForCandidate(baseEuropePmcCandidate, europePmc);
    expect(europePmc.fetchFullText).toHaveBeenCalledWith('PMC', 'PMC123');
    expect(result).toBe('full text here');
  });

  it("tries europe_pmc with source 'MED' for a pubmed-family candidate", async () => {
    const europePmc = fakeEuropePmc({ fetchFullText: vi.fn().mockResolvedValue(null) });
    const result = await fetchFullTextForCandidate(basePubmedCandidate, europePmc);
    expect(europePmc.fetchFullText).toHaveBeenCalledWith('MED', '111');
    expect(result).toBeNull();
  });

  it('returns null without calling the client for a pubmed candidate with no pmid', async () => {
    const europePmc = fakeEuropePmc();
    const result = await fetchFullTextForCandidate({ ...basePubmedCandidate, pmid: undefined }, europePmc);
    expect(result).toBeNull();
    expect(europePmc.fetchFullText).not.toHaveBeenCalled();
  });

  it('returns null without calling the client for an unsupported family', async () => {
    const europePmc = fakeEuropePmc();
    const result = await fetchFullTextForCandidate({ ...baseEuropePmcCandidate, family: 'web', tempId: 'web:1' }, europePmc);
    expect(result).toBeNull();
    expect(europePmc.fetchFullText).not.toHaveBeenCalled();
  });
});
