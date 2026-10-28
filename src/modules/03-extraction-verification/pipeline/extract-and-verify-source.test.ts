import { describe, expect, it, vi } from 'vitest';
import type { CrossrefClient } from '@/modules/02-retrieval';
import type { MetaClient, RespondResult } from '@/shared/meta';
import { createInMemoryBudgetGuard } from '@/shared/security';
import { extractAndVerifySource } from './extract-and-verify-source';

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

function fakeCrossref(overrides: Partial<CrossrefClient> = {}): CrossrefClient {
  return { lookup: vi.fn().mockResolvedValue(null), ...overrides };
}

function baseDeps(metaClient: MetaClient, crossref: CrossrefClient = fakeCrossref()) {
  return {
    metaClient,
    budgetGuard: createInMemoryBudgetGuard({ runCostCapUsd: 1, dailyBudgetUsd: 20 }),
    crossref,
    p0Preamble: 'P0',
    p5PromptTemplate: 'Extract: {{source_title}} / {{sub_questions}} / {{passages}}',
    p10PromptTemplate: 'Judge: {{claim_text}} / {{conditions_json}} / {{quote}} / {{surrounding_context}}',
  };
}

const FULL_TEXT = 'Aspirin 325 mg should be given promptly in suspected ACS.';

describe('extractAndVerifySource', () => {
  it('returns status no_text when the source has no fetchable full text', async () => {
    const metaClient: MetaClient = { respond: vi.fn(), listModels: vi.fn() };
    const result = await extractAndVerifySource(
      { runId: 'run_1', sourceId: 'src_1', sourceTitle: 'x', fullText: '', subQuestions: [] },
      baseDeps(metaClient),
    );
    expect(result).toEqual({ sourceId: 'src_1', status: 'no_text' });
    expect(metaClient.respond).not.toHaveBeenCalled();
  });

  it('extracts and verifies a claim end to end for one source', async () => {
    const output = {
      claims: [
        {
          text: 'Give aspirin 325 mg for suspected ACS.',
          basis: 'recommendation' as const,
          actionType: 'treat' as const,
          conditions: [],
          quote: 'Aspirin 325 mg should be given promptly in suspected ACS.',
          passageId: 'src_1:0',
          safetyCritical: false,
        },
      ],
    };
    const respond = vi.fn().mockResolvedValue(fakeRespondResult(output));
    const metaClient: MetaClient = { respond, listModels: vi.fn() };

    const result = await extractAndVerifySource(
      { runId: 'run_1', sourceId: 'src_1', sourceTitle: 'ACS Guideline', fullText: FULL_TEXT, subQuestions: ['first-line treatment'] },
      baseDeps(metaClient),
    );

    expect(result.status).toBe('ok');
    if (result.status === 'ok') {
      expect(result.claims).toHaveLength(1);
      expect(result.dropped).toEqual([]);
      expect(result.claims[0]?.verification.support).toBe('unknown');
    }
  });

  it('drops claims and keeps none when the source is retracted (Crossref)', async () => {
    const output = {
      claims: [
        {
          text: 'Give aspirin 325 mg for suspected ACS.',
          basis: 'recommendation' as const,
          actionType: 'treat' as const,
          conditions: [],
          quote: 'Aspirin 325 mg should be given promptly in suspected ACS.',
          passageId: 'src_1:0',
          safetyCritical: false,
        },
      ],
    };
    const respond = vi.fn().mockResolvedValue(fakeRespondResult(output));
    const metaClient: MetaClient = { respond, listModels: vi.fn() };
    const crossref = fakeCrossref({
      lookup: vi.fn().mockResolvedValue({ doi: '10.1/x', retracted: true, updateNotices: [{ type: 'retraction', doi: '10.1/x' }] }),
    });

    const result = await extractAndVerifySource(
      { runId: 'run_1', sourceId: 'src_1', sourceTitle: 'x', fullText: FULL_TEXT, subQuestions: [], doi: '10.1/x' },
      baseDeps(metaClient, crossref),
    );

    expect(result.status).toBe('ok');
    if (result.status === 'ok') {
      expect(result.claims).toEqual([]);
      expect(result.dropped).toEqual([{ reason: 'source is retracted or withdrawn' }]);
    }
  });

  it('returns status extraction_failed when the extractor agent abstains', async () => {
    const respond = vi.fn().mockResolvedValue(fakeRespondResult({ claims: 'not-an-array' }));
    const metaClient: MetaClient = { respond, listModels: vi.fn() };

    const result = await extractAndVerifySource(
      { runId: 'run_1', sourceId: 'src_1', sourceTitle: 'x', fullText: FULL_TEXT, subQuestions: [] },
      baseDeps(metaClient),
    );

    expect(result).toEqual({ sourceId: 'src_1', status: 'extraction_failed', reason: expect.any(String) });
  });
});
