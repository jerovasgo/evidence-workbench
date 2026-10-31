import { expect, it, vi } from 'vitest';
import { synthesizeRetrievedOverview } from './evidence-overview';
import { runAgent } from '@/shared/agents';
import { createInMemoryBudgetGuard } from '@/shared/security';
vi.mock('@/shared/agents', () => ({ runAgent: vi.fn() }));
const deps = { metaClient: { respond: vi.fn(), listModels: vi.fn() }, budgetGuard: createInMemoryBudgetGuard({ runCostCapUsd: 1, dailyBudgetUsd: 1 }), p0Preamble: '' };
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
