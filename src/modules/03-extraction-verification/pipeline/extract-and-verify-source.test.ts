import { describe, expect, it, vi } from 'vitest';
import type { CrossrefClient } from '@/modules/02-retrieval';
import type { MetaClient, RespondResult } from '@/shared/meta';
import { createInMemoryBudgetGuard } from '@/shared/security';
import { batchPassagesForExtraction, extractAndVerifySource } from './extract-and-verify-source';

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

const FULL_TEXT = 'Adding 50 mL of polar aprotic solvent increased the SN2 reaction rate.';

describe('extractAndVerifySource', () => {
  it('starts a new extraction call at a research section boundary', () => {
    const batches = batchPassagesForExtraction([{ text: 'ABSTRACT\n\nFirst result' }, { text: 'INTRO\n\nBackground' }, { text: 'Follow-up result' }]);
    expect(batches.map((batch) => batch.length)).toEqual([1, 2]);
  });
  it('retains a supported finding from a later passage batch', async () => {
    const quote = 'Section 5 reports a second finding.';
    const respond = vi.fn()
      .mockResolvedValueOnce(fakeRespondResult({ claims: [] }))
      .mockResolvedValueOnce(fakeRespondResult({ claims: [{ text: quote, basis: 'primary', actionType: 'finding', conditions: [], quote, passageId: 'src_1:4', safetyCritical: false }] }))
      .mockResolvedValueOnce(fakeRespondResult({ support: 'supports', issues: [], note: 'Supported.' }));
    const metaClient: MetaClient = { respond, listModels: vi.fn() };
    const paragraph = Array.from({ length: 850 }, () => 'evidence').join(' ');
    const fullText = Array.from({ length: 5 }, (_, index) => `${index === 4 ? quote : `Section ${index + 1}.`} ${paragraph}`).join('\n\n');
    const result = await extractAndVerifySource(
      { runId: 'run_1', sourceId: 'src_1', sourceTitle: 'Long article', fullText, subQuestions: ['What does the article report?'], doi: '10.1/long' },
      baseDeps(metaClient, fakeCrossref({ lookup: vi.fn().mockResolvedValue({ doi: '10.1/long', retracted: false, updateNotices: [] }) })),
    );
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') throw new Error('unreachable');
    expect(result.claims).toHaveLength(1);
    expect(result.claims[0]!.quote).toBe(quote);
    expect(respond).toHaveBeenCalledTimes(3);
  });
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
          text: 'Adding 50 mL of polar aprotic solvent increases the SN2 reaction rate.',
          basis: 'primary' as const,
          actionType: 'finding' as const,
          conditions: [],
          quote: 'Adding 50 mL of polar aprotic solvent increased the SN2 reaction rate.',
          passageId: 'src_1:0',
          safetyCritical: false,
        },
      ],
    };
    const respond = vi.fn().mockResolvedValue(fakeRespondResult(output));
    const metaClient: MetaClient = { respond, listModels: vi.fn() };

    const result = await extractAndVerifySource(
      { runId: 'run_1', sourceId: 'src_1', sourceTitle: 'SN2 Reaction Kinetics', fullText: FULL_TEXT, subQuestions: ['first-line treatment'] },
      baseDeps(metaClient),
    );

    expect(result.status).toBe('ok');
    if (result.status === 'ok') {
      expect(result.claims).toHaveLength(0);
      expect(result.dropped).toEqual([{ reason: 'retraction status unknown: No DOI available for Crossref status check' }]);
    }
  });

  it('retains partial support with a caveat outside the fully verified claim set', async () => {
    const claim = { text: FULL_TEXT, basis: 'primary', actionType: 'finding', conditions: [], quote: FULL_TEXT, passageId: 'src_1:0', safetyCritical: false };
    const respond = vi.fn().mockResolvedValueOnce(fakeRespondResult({ claims: [claim] }))
      .mockResolvedValueOnce(fakeRespondResult({ support: 'partial', issues: ['wrong_scope'], note: 'Only one model was tested.' }));
    const result = await extractAndVerifySource(
      { runId: 'run_partial', sourceId: 'src_1', sourceTitle: 'x', fullText: FULL_TEXT, subQuestions: [], doi: '10.1/partial' },
      baseDeps({ respond, listModels: vi.fn() }, fakeCrossref({ lookup: vi.fn().mockResolvedValue({ doi: '10.1/partial', retracted: false, updateNotices: [] }) })),
    );
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') throw new Error('unreachable');
    expect(result.claims).toHaveLength(0);
    expect(result.qualified).toHaveLength(1);
    expect(result.qualified[0]?.verificationReport?.final).toBe('partial');
    expect(result.qualified[0]?.verification.supportNote).toBe('Only one model was tested.');
  });

  it('rejects a supported claim if its retraction status cannot be checked', async () => {
    const claim = { text: FULL_TEXT, basis: 'primary', actionType: 'finding', conditions: [], quote: FULL_TEXT, passageId: 'src_1:0', safetyCritical: false };
    const respond = vi.fn().mockResolvedValueOnce(fakeRespondResult({ claims: [claim] }))
      .mockResolvedValueOnce(fakeRespondResult({ support: 'supports', issues: [], note: 'Supported' }));
    const result = await extractAndVerifySource(
      { runId: 'run_1', sourceId: 'src_1', sourceTitle: 'x', fullText: FULL_TEXT, subQuestions: [], doi: '10.1/missing' },
      baseDeps({ respond, listModels: vi.fn() }),
    );
    expect(result.status).toBe('ok');
    if (result.status === 'ok') {
      expect(result.claims).toEqual([]);
      expect(result.dropped[0]?.reason).toContain('retraction status unknown');
    }
  });

  it('attributes a withdrawal to the displayed claim rather than an earlier discarded extraction', async () => {
    const valid = { text: FULL_TEXT, basis: 'primary', actionType: 'finding', conditions: [], quote: FULL_TEXT, passageId: 'src_1:0', safetyCritical: false };
    const invalid = { ...valid, text: 'After 90 minutes, the SN2 reaction rate changed.' };
    const onProvisionalClaims = vi.fn();
    const respond = vi.fn().mockResolvedValue(fakeRespondResult({ claims: [invalid, valid] }));
    const result = await extractAndVerifySource(
      { runId: 'run_1', sourceId: 'src_1', sourceTitle: 'x', fullText: FULL_TEXT, subQuestions: [], doi: '10.1/missing' },
      { ...baseDeps({ respond, listModels: vi.fn() }), onProvisionalClaims },
    );
    expect(onProvisionalClaims).toHaveBeenCalledTimes(1);
    if (result.status === 'ok') {
      expect(result.withdrawn).toHaveLength(1);
      expect(result.withdrawn[0]?.id).toBe(onProvisionalClaims.mock.calls[0]?.[0][0].id);
      expect(result.withdrawn[0]?.reason).toContain('retraction status unknown');
    }
  });

  it('publishes a located claim provisionally before support review completes', async () => {
    const claim = { text: FULL_TEXT, basis: 'primary', actionType: 'finding', conditions: [], quote: FULL_TEXT, passageId: 'src_1:0', safetyCritical: false };
    let finishJudge: ((value: RespondResult) => void) | undefined;
    const judge = new Promise<RespondResult>((resolve) => { finishJudge = resolve; });
    const respond = vi.fn().mockResolvedValueOnce(fakeRespondResult({ claims: [claim] })).mockReturnValueOnce(judge);
    const onProvisionalClaims = vi.fn();
    const crossref = fakeCrossref({ lookup: vi.fn().mockResolvedValue({ doi: '10.1/exists', retracted: false, updateNotices: [] }) });
    const pending = extractAndVerifySource(
      { runId: 'run_1', sourceId: 'src_1', sourceTitle: 'x', fullText: FULL_TEXT, subQuestions: [], doi: '10.1/exists' },
      { ...baseDeps({ respond, listModels: vi.fn() }, crossref), onProvisionalClaims },
    );
    await vi.waitFor(() => expect(onProvisionalClaims).toHaveBeenCalledTimes(1));
    const provisional = onProvisionalClaims.mock.calls[0]?.[0][0];
    expect(provisional.verification).toMatchObject({ exists: false, quoteFound: true, support: 'unknown' });
    finishJudge!(fakeRespondResult({ support: 'supports', issues: [], note: 'Supported' }));
    const result = await pending;
    expect(result.status).toBe('ok');
    if (result.status === 'ok') expect(result.claims[0]?.id).toBe(provisional.id);
  });

  it('drops claims and keeps none when the source is retracted (Crossref)', async () => {
    const output = {
      claims: [
        {
          text: 'Adding 50 mL of polar aprotic solvent increases the SN2 reaction rate.',
          basis: 'primary' as const,
          actionType: 'finding' as const,
          conditions: [],
          quote: 'Adding 50 mL of polar aprotic solvent increased the SN2 reaction rate.',
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
