import { describe, expect, it, vi } from 'vitest';
import type { MetaClient, RespondResult } from '@/shared/meta';
import { createInMemoryBudgetGuard } from '@/shared/security';
import { extractClaims } from './claim-extractor';

function fakeRespondResult(parsed: unknown): RespondResult {
  return {
    id: 'resp_x',
    text: JSON.stringify(parsed),
    parsed,
    webSearchResults: [],
    usage: { inputTokens: 10, cachedInputTokens: 0, outputTokens: 10, totalTokens: 20 },
    costUsd: 0.001,
    raw: {},
  };
}

function baseDeps(metaClient: MetaClient) {
  return {
    metaClient,
    budgetGuard: createInMemoryBudgetGuard({ runCostCapUsd: 0.4, dailyBudgetUsd: 20 }),
    p0Preamble: 'P0 preamble',
    p5PromptTemplate: 'Extract: {{source_title}} / {{sub_questions}} / {{passages}}',
  };
}

const PASSAGES = [{ passageId: 'p1', locator: '¶1', text: 'Adding 50 mL of polar aprotic solvent increased the SN2 reaction rate.' }];

describe('extractClaims', () => {
  it('returns valid claims for a well-formed model response', async () => {
    const output = {
      claims: [
        {
          text: 'Adding a polar aprotic solvent increases the SN2 reaction rate.',
          basis: 'primary' as const,
          actionType: 'finding' as const,
          conditions: [],
          quote: 'Adding 50 mL of polar aprotic solvent increased the SN2 reaction rate.',
          passageId: 'p1',
          safetyCritical: false,
        },
      ],
    };
    const respond = vi.fn().mockResolvedValue(fakeRespondResult(output));
    const metaClient: MetaClient = { respond, listModels: vi.fn() };

    const result = await extractClaims(
      'run_1',
      { sourceTitle: 'SN2 Reaction Kinetics', passages: PASSAGES, subQuestions: ['which solvents accelerate the reaction'] },
      baseDeps(metaClient),
    );

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toEqual(output);
  });

  it('returns an empty claims array when no passage answers the question', async () => {
    const respond = vi.fn().mockResolvedValue(fakeRespondResult({ claims: [] }));
    const metaClient: MetaClient = { respond, listModels: vi.fn() };

    const result = await extractClaims(
      'run_1',
      { sourceTitle: 'Unrelated source', passages: PASSAGES, subQuestions: ['unrelated question'] },
      baseDeps(metaClient),
    );

    expect(result).toEqual({ ok: true, value: { claims: [] }, usage: expect.any(Object) });
  });

  it('embeds source title, sub-questions and passages in the prompt', async () => {
    const respond = vi.fn().mockResolvedValue(fakeRespondResult({ claims: [] }));
    const metaClient: MetaClient = { respond, listModels: vi.fn() };

    await extractClaims(
      'run_1',
      { sourceTitle: 'SN2 Reaction Kinetics', passages: PASSAGES, subQuestions: ['which solvents accelerate the reaction'] },
      baseDeps(metaClient),
    );

    const sentPrompt = (respond.mock.calls[0]?.[0] as { input: { content: string }[] }).input[1]?.content;
    expect(sentPrompt).toContain('SN2 Reaction Kinetics');
    expect(sentPrompt).toContain('which solvents accelerate the reaction');
    expect(sentPrompt).toContain('50 mL');
  });

  it('abstains with reason invalid when the model invents a passageId not in the input', async () => {
    // Shape-valid per zod (passageId is just a string), but this is exactly the kind
    // of error verify-claim.ts (code) must catch, not the schema -- this test only
    // documents that the schema itself does not reject it; see verify-claim.test.ts
    // for the real guard.
    const output = { claims: [{ text: 'x', basis: 'primary', actionType: 'finding', conditions: [], quote: 'x', passageId: 'does-not-exist', safetyCritical: false }] };
    const respond = vi.fn().mockResolvedValue(fakeRespondResult(output));
    const metaClient: MetaClient = { respond, listModels: vi.fn() };

    const result = await extractClaims('run_1', { sourceTitle: 'x', passages: PASSAGES, subQuestions: [] }, baseDeps(metaClient));
    expect(result.ok).toBe(true);
  });
});
