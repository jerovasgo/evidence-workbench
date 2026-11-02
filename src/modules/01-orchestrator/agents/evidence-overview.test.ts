import { expect, it, vi } from 'vitest';
import { synthesizeEvidenceOverview, synthesizeRetrievedOverview } from './evidence-overview';
import { runAgent } from '@/shared/agents';
import { createInMemoryBudgetGuard } from '@/shared/security';
import type { Claim } from '@/shared/domain';
vi.mock('@/shared/agents', () => ({ runAgent: vi.fn() }));
const deps = { metaClient: { respond: vi.fn(), listModels: vi.fn() }, budgetGuard: createInMemoryBudgetGuard({ runCostCapUsd: 1, dailyBudgetUsd: 1 }), p0Preamble: '' };

const claim = (id: string): Claim => ({
  id, text: 'A verified finding.', basis: 'primary', actionType: 'finding', conditions: [],
  sourceId: 's1', passageId: 'p1', quote: 'A verified finding.',
  grade: { certainty: 'moderate', origin: 'source' }, safetyCritical: false,
  verification: { exists: true, quoteFound: true, quoteMatch: 'normalized_exact', retracted: false, support: 'supports', retractionCheck: 'crossref_no_signal' },
});

it('returns the lead text with no sections when the model adds none', async () => {
  vi.mocked(runAgent).mockResolvedValue({ ok: true, value: { text: 'Lead answer.', claimIds: ['c1'] } } as never);
  expect(await synthesizeEvidenceOverview('r', 'q', [claim('c1')], deps)).toEqual({ text: 'Lead answer.', sections: [] });
});

it('returns well-grounded sections alongside the lead text', async () => {
  vi.mocked(runAgent).mockResolvedValue({
    ok: true,
    value: { text: 'Lead answer.', sections: [{ heading: 'Mechanisms', body: 'How it works.', claimIds: ['c2'] }], claimIds: ['c1', 'c2'] },
  } as never);
  const result = await synthesizeEvidenceOverview('r', 'q', [claim('c1'), claim('c2')], deps);
  expect(result).toEqual({ text: 'Lead answer.', sections: [{ heading: 'Mechanisms', body: 'How it works.', claimIds: ['c2'] }] });
});

it('abstains when a section cites a claim id outside the supplied pool', async () => {
  vi.mocked(runAgent).mockResolvedValue({
    ok: true,
    value: { text: 'Lead answer.', sections: [{ heading: 'Mechanisms', body: 'How it works.', claimIds: ['invented'] }], claimIds: ['c1'] },
  } as never);
  expect(await synthesizeEvidenceOverview('r', 'q', [claim('c1')], deps)).toBeNull();
});
it('abstains without retrieved text', async () => {
 expect(await synthesizeRetrievedOverview('r', 'q', [], deps)).toBeNull();
});
it('rejects invented source references', async () => {
 vi.mocked(runAgent).mockResolvedValue({ ok: true, value: { text: 'Answer', sourceIds: ['invented'] } } as never);
 expect(await synthesizeRetrievedOverview('r', 'q', [{ id: 'real', title: 'Study', abstract: 'Measured result' }], deps)).toBeNull();
});
it('accepts an answer with supplied references', async () => {
 vi.mocked(runAgent).mockResolvedValue({ ok: true, value: { text: 'Answer', sourceIds: ['real'] } } as never);
 expect(await synthesizeRetrievedOverview('r', 'q', [{ id: 'real', title: 'Study', abstract: 'Measured result' }], deps)).toBe('Answer');
});
