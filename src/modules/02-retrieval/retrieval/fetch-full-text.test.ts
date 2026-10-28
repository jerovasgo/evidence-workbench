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

  it('returns null for a web candidate when no webFetch options are given', async () => {
    const europePmc = fakeEuropePmc();
    const result = await fetchFullTextForCandidate({ ...baseEuropePmcCandidate, family: 'web', tempId: 'web:1' }, europePmc);
    expect(result).toBeNull();
    expect(europePmc.fetchFullText).not.toHaveBeenCalled();
  });

  it('re-fetches a web/guideline candidate by its own URL via fetch_url_text', async () => {
    const europePmc = fakeEuropePmc();
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response('<html><body><p>Real guideline text</p></body></html>', { status: 200, headers: { 'Content-Type': 'text/html' } }),
    ) as unknown as typeof fetch;
    const candidate: CandidateSource = { tempId: 'web:1', family: 'guideline', title: 'A guideline', url: 'https://www.cdc.gov/x' };

    const result = await fetchFullTextForCandidate(candidate, europePmc, { allowedDomains: ['cdc.gov'], fetchImpl });

    expect(result).toContain('Real guideline text');
  });

  it('returns null when the web/guideline candidate URL is not on the allow-list', async () => {
    const europePmc = fakeEuropePmc();
    const candidate: CandidateSource = { tempId: 'web:1', family: 'web', title: 'x', url: 'https://not-allowed.example.com/x' };

    const result = await fetchFullTextForCandidate(candidate, europePmc, { allowedDomains: ['cdc.gov'] });

    expect(result).toBeNull();
  });
});
