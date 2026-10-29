import { describe, expect, it, vi } from 'vitest';
import type { CandidateSource, CrossrefClient, EuropePmcClient, SourceClassification } from '@/modules/02-retrieval';
import type { MetaClient, RespondResult } from '@/shared/meta';
import { createInMemoryBudgetGuard } from '@/shared/security';
import { extractAndVerifyPool } from './extract-and-verify-pool';

function fakeRespondResult(parsed: unknown): RespondResult {
  return {
    id: 'resp_x',
    text: JSON.stringify(parsed),
    parsed,
    webSearchResults: [],
    usage: { inputTokens: 10, cachedInputTokens: 0, outputTokens: 10, totalTokens: 20 },
    costUsd: 0.01,
    raw: {},
  };
}

function candidate(tempId: string, family: CandidateSource['family'] = 'europe_pmc'): CandidateSource {
  return { tempId, family, title: `Source ${tempId}`, url: `https://example.org/${tempId}`, doi: '10.1/example' };
}

function fakeEuropePmc(fetchFullTextImpl: (source: string, id: string) => Promise<string | null>): EuropePmcClient {
  return { search: vi.fn(), fetchFullText: vi.fn(fetchFullTextImpl) };
}

function fakeCrossref(): CrossrefClient {
  return { lookup: vi.fn().mockResolvedValue({ doi: '10.1/example', retracted: false, updateNotices: [] }) };
}

const CLAIM_OUTPUT = {
  claims: [
    {
      text: 'Adding 50 mL of polar aprotic solvent increases the SN2 reaction rate.',
      basis: 'primary' as const,
      actionType: 'finding' as const,
      conditions: [],
      quote: 'Adding 50 mL of polar aprotic solvent increased the SN2 reaction rate.',
      passageId: 'placeholder',
      safetyCritical: false,
    },
  ],
};

function baseDeps(metaClient: MetaClient, europePmc: EuropePmcClient) {
  return {
    metaClient,
    budgetGuard: createInMemoryBudgetGuard({ runCostCapUsd: 1, dailyBudgetUsd: 20 }),
    crossref: fakeCrossref(),
    europePmc,
    p0Preamble: 'P0',
    p5PromptTemplate: 'Extract: {{source_title}} / {{sub_questions}} / {{passages}}',
    p10PromptTemplate: 'Judge: {{claim_text}} / {{conditions_json}} / {{quote}} / {{surrounding_context}}',
  };
}

describe('extractAndVerifyPool', () => {
  it('skips a candidate with no full text and records it as no_full_text', async () => {
    const metaClient: MetaClient = { respond: vi.fn(), listModels: vi.fn() };
    const europePmc = fakeEuropePmc(async () => null);

    const result = await extractAndVerifyPool(
      { runId: 'run_1', candidates: [candidate('europe_pmc:PMC:1')], classifications: [], subQuestions: [] },
      baseDeps(metaClient, europePmc),
    );

    expect(result.claims).toEqual([]);
    expect(result.perSource).toEqual([{ sourceId: 'europe_pmc:PMC:1', outcome: { status: 'no_full_text' } }]);
    expect(metaClient.respond).not.toHaveBeenCalled();
  });

  it('extracts and verifies claims for a candidate with fetchable full text', async () => {
    const respond = vi.fn()
      .mockResolvedValueOnce(fakeRespondResult({ claims: [{ ...CLAIM_OUTPUT.claims[0], passageId: 'europe_pmc:PMC:1:0' }] }))
      .mockResolvedValueOnce(fakeRespondResult({ support: 'supports', issues: [], note: 'Supported.' }));
    const metaClient: MetaClient = { respond, listModels: vi.fn() };
    const europePmc = fakeEuropePmc(async () => 'Adding 50 mL of polar aprotic solvent increased the SN2 reaction rate.');

    const result = await extractAndVerifyPool(
      { runId: 'run_1', candidates: [candidate('europe_pmc:PMC:1')], classifications: [], subQuestions: ['first-line treatment'] },
      baseDeps(metaClient, europePmc),
    );

    expect(result.claims).toHaveLength(1);
    expect(result.perSource[0]?.outcome.status).toBe('ok');
  });

  it('calls onSourceDone once per candidate', async () => {
    const metaClient: MetaClient = { respond: vi.fn(), listModels: vi.fn() };
    const europePmc = fakeEuropePmc(async () => null);
    const onSourceDone = vi.fn();

    await extractAndVerifyPool(
      { runId: 'run_1', candidates: [candidate('europe_pmc:PMC:1'), candidate('europe_pmc:PMC:2')], classifications: [], subQuestions: [] },
      { ...baseDeps(metaClient, europePmc), onSourceDone },
    );

    expect(onSourceDone).toHaveBeenCalledTimes(2);
  });

  it('prioritizes guideline-kind candidates and truncates to maxSources', async () => {
    const seen: string[] = [];
    const metaClient: MetaClient = { respond: vi.fn(), listModels: vi.fn() };
    const europePmc = fakeEuropePmc(async (_source, id) => {
      seen.push(id);
      return null;
    });
    const classifications: SourceClassification[] = [
      { sourceId: 'europe_pmc:PMC:rct', kind: 'controlled_experiment', isScientific: true, confidence: 'high' },
      { sourceId: 'europe_pmc:PMC:guideline', kind: 'standards_body', isScientific: true, confidence: 'high' },
    ];

    await extractAndVerifyPool(
      {
        runId: 'run_1',
        candidates: [candidate('europe_pmc:PMC:rct'), candidate('europe_pmc:PMC:guideline'), candidate('europe_pmc:PMC:other')],
        classifications,
        subQuestions: [],
        maxSources: 2,
        maxConcurrency: 1, // force sequential so `seen` order is deterministic
      },
      baseDeps(metaClient, europePmc),
    );

    expect(seen).toEqual(['guideline', 'rct']); // the unclassified 'other' is truncated out
  });
});
