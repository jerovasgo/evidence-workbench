import { expect, it } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import {
  assessRetrievalSufficiency,
  buildSeedSearchPlan,
  createEuropePmcClient,
  createPubmedClient,
  deduplicateCandidates,
  executeSearchPlan,
  planSearch,
  prioritizeSources,
} from '@/modules/02-retrieval';
import { createMetaClient } from '@/shared/meta';
import { createInMemoryBudgetGuard } from '@/shared/security';

it.skipIf(process.env.LIVE_RESCUE !== '1')('validates generic retrieval expansion and semantic rescue', async () => {
  process.loadEnvFile('.env.local');
  const pubmed = createPubmedClient({ apiKey: process.env.NCBI_API_KEY || undefined });
  const europePmc = createEuropePmcClient();
  const metaClient = createMetaClient({ apiKey: process.env.META_API_KEY!, baseUrl: process.env.META_API_BASE_URL! });
  const p0Preamble = readFileSync('prompts/P0-preamble.md', 'utf8');
  const p3PromptTemplate = readFileSync('prompts/P3-search-planner.md', 'utf8');
  const cases = [
    'What genes are most associated with drought tolerance in rice?',
    '¿Qué mecanismos relacionan la autofagia con el envejecimiento muscular?',
  ];
  const results = [];
  for (const [index, query] of cases.entries()) {
    const started = Date.now();
    const seedPlan = buildSeedSearchPlan(query);
    const initial = await executeSearchPlan(seedPlan, { pubmed, europePmc });
    const initialCandidates = deduplicateCandidates(initial.candidates);
    const assessment = assessRetrievalSufficiency(query, initialCandidates);
    let rescuePlan = null;
    let rescuedCandidates = [] as typeof initialCandidates;
    if (assessment.status !== 'sufficient') {
      const planned = await planSearch(`live-rescue-${Date.now()}-${index}`, { condition: query }, {
        metaClient,
        budgetGuard: createInMemoryBudgetGuard({ runCostCapUsd: 0.15, dailyBudgetUsd: 1 }),
        p0Preamble,
        p3PromptTemplate,
      });
      if (planned.ok) {
        rescuePlan = planned.value;
        const rescue = await executeSearchPlan(planned.value, { pubmed, europePmc });
        rescuedCandidates = deduplicateCandidates(rescue.candidates);
      }
    }
    const merged = deduplicateCandidates([...initialCandidates, ...rescuedCandidates]);
    results.push({
      query,
      elapsedMs: Date.now() - started,
      assessment,
      seedPlan,
      rescuePlan,
      initialCount: initialCandidates.length,
      rescuedCount: rescuedCandidates.length,
      finalAssessment: assessRetrievalSufficiency(query, merged),
      topTitles: prioritizeSources(query, merged).slice(0, 5).map(({ source }) => source.title),
    });
  }
  writeFileSync('evals/genetics/retrieval-rescue-live.json', JSON.stringify(results, null, 2));
  expect(results.every((result) => result.topTitles.length > 0)).toBe(true);
  expect(results.every((result) => result.finalAssessment.status !== 'empty' && result.finalAssessment.status !== 'off_topic')).toBe(true);
}, 120_000);
