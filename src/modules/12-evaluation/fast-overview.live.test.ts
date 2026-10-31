import { expect, it } from 'vitest';
import { createEuropePmcClient } from '@/modules/02-retrieval';
import { createMetaClient } from '@/shared/meta';
import { createInMemoryBudgetGuard } from '@/shared/security';
import { synthesizeRetrievedOverview } from '@/modules/01-orchestrator';
import { readFileSync, writeFileSync } from 'node:fs';
it.skipIf(process.env.LIVE_FAST !== '1')('measures real retrieved overview without bibliographic processing', async () => {
 process.loadEnvFile('.env.local');
 const started = Date.now();
 const epmc = createEuropePmcClient();
 const results = await epmc.search('hypoxia gene expression', { pageSize: 3 });
 const sources = (await Promise.all(results.map(async (source) => ({ id: source.id, title: source.title, abstract: await epmc.fetchAbstract!(source.source, source.id) })))).filter((source): source is { id: string; title: string; abstract: string } => !!source.abstract);
 const retrievalMs = Date.now() - started;
 const text = await synthesizeRetrievedOverview('live-fast-' + started, 'Compara estudios de expresión génica bajo hipoxia', sources, { metaClient: createMetaClient({ apiKey: process.env.META_API_KEY!, baseUrl: process.env.META_API_BASE_URL! }), budgetGuard: createInMemoryBudgetGuard({ runCostCapUsd: 0.1, dailyBudgetUsd: 1 }), p0Preamble: readFileSync('prompts/P0-preamble.md', 'utf8') });
 const result = { retrievalMs, overviewMs: Date.now() - started, text, sources: sources.map(({ id, title }) => ({ id, title })) };
 writeFileSync('evals/genetics/fast-overview-live.json', JSON.stringify(result, null, 2));
 expect(text).toBeTruthy();
 console.log(JSON.stringify(result));
}, 45000);
