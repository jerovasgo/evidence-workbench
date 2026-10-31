import { describe, it } from 'vitest';
import { createMetaClient } from '@/shared/meta';
import { createInMemoryBudgetGuard } from '@/shared/security';
import { createCrossrefClient, createEuropePmcClient } from '@/modules/02-retrieval';
import { batchPassagesForExtraction, extractAndVerifySource, extractClaims, judgeSupport, windowText } from '@/modules/03-extraction-verification';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Manual, cost-incurring pilot. Run with LIVE_GENETIC_EVAL=1; never runs in CI.
describe.skipIf(process.env.LIVE_GENETIC_EVAL !== '1')('genetic extraction pilot', () => {
  it('reports extracted claims from two pinned real abstracts', async () => {
    process.loadEnvFile('.env.local');
    const metaClient = createMetaClient({ apiKey: process.env.META_API_KEY!, baseUrl: process.env.META_API_BASE_URL! });
    const europePmc = createEuropePmcClient();
    const p0Preamble = readFileSync(join(process.cwd(), 'prompts/P0-preamble.md'), 'utf8');
    const p5PromptTemplate = readFileSync(join(process.cwd(), 'prompts/P5-claim-extractor.md'), 'utf8');
    const budgetGuard = createInMemoryBudgetGuard({ runCostCapUsd: 0.3, dailyBudgetUsd: 1 });
    const studies = [
      { id: '22745249', title: 'Jinek et al. 2012', question: 'What DNA cleavage mechanisms did Jinek et al. demonstrate?' },
      { id: '23287718', title: 'Cong et al. 2013', question: 'What genome editing capabilities did Cong et al. demonstrate?' },
    ];
    const outcomes = await Promise.all(studies.map(async (study) => {
      const abstract = await europePmc.fetchAbstract?.('MED', study.id);
      if (!abstract) throw new Error(`No abstract for ${study.id}`);
      const passages = windowText(study.id, abstract);
      const result = await extractClaims(`pilot-${study.id}`, {
        sourceTitle: study.title,
        subQuestions: [study.question],
        passages: passages.map((passage) => ({ passageId: passage.id, locator: passage.locator, text: passage.text })),
      }, { metaClient, budgetGuard, p0Preamble, p5PromptTemplate });
      return { id: study.id, ok: result.ok, claims: result.ok ? result.value.claims.map((claim) => ({ text: claim.text, quote: claim.quote, passageId: claim.passageId })) : [], reason: result.ok ? undefined : result.detail };
    }));
    console.log(JSON.stringify({ type: 'genetic_extraction_pilot', outcomes }));
  }, 120_000);

  it.skipIf(process.env.LIVE_GENETIC_VERIFY !== '1')('reports full verification and drop reasons', async () => {
    process.loadEnvFile('.env.local');
    const metaClient = createMetaClient({ apiKey: process.env.META_API_KEY!, baseUrl: process.env.META_API_BASE_URL! });
    const europePmc = createEuropePmcClient();
    const crossref = createCrossrefClient();
    const budgetGuard = createInMemoryBudgetGuard({ runCostCapUsd: 0.5, dailyBudgetUsd: 2 });
    const p0Preamble = readFileSync(join(process.cwd(), 'prompts/P0-preamble.md'), 'utf8');
    const p5PromptTemplate = readFileSync(join(process.cwd(), 'prompts/P5-claim-extractor.md'), 'utf8');
    const p10PromptTemplate = readFileSync(join(process.cwd(), 'prompts/P10-support-judge.md'), 'utf8');
    const studies = [
      { id: '22745249', doi: '10.1126/science.1225829', title: 'Jinek et al. 2012', question: 'What DNA cleavage mechanisms did Jinek et al. demonstrate?' },
      { id: '23287718', doi: '10.1126/science.1231143', title: 'Cong et al. 2013', question: 'What genome editing capabilities did Cong et al. demonstrate?' },
    ];
    const outcomes = await Promise.all(studies.map(async (study) => {
      const fullText = await europePmc.fetchAbstract?.('MED', study.id);
      if (!fullText) throw new Error(`No abstract for ${study.id}`);
      const result = await extractAndVerifySource({ runId: `pilot-verify-${study.id}`, sourceId: `MED:${study.id}`, sourceTitle: study.title, fullText, subQuestions: [study.question], doi: study.doi },
        { metaClient, budgetGuard, crossref, p0Preamble, p5PromptTemplate, p10PromptTemplate });
      return { id: study.id, status: result.status, verified: result.status === 'ok' ? result.claims.map((claim) => claim.text) : [], partial: result.status === 'ok' ? result.qualified.map((claim) => claim.text) : [], dropped: result.status === 'ok' ? result.dropped : [] };
    }));
    console.log(JSON.stringify({ type: 'genetic_verification_pilot', outcomes }));
  }, 180_000);

  it.skipIf(process.env.LIVE_GENETIC_LONG !== '1')('reports section-wise extraction from a long article', async () => {
    process.loadEnvFile('.env.local');
    const metaClient = createMetaClient({ apiKey: process.env.META_API_KEY!, baseUrl: process.env.META_API_BASE_URL! });
    const europePmc = createEuropePmcClient();
    const fullText = await europePmc.fetchFullText('MED', '23287718');
    if (!fullText) throw new Error('No full text for Cong 2013');
    const passages = windowText('MED:23287718', fullText);
    const batches = batchPassagesForExtraction(passages);
    const p0Preamble = readFileSync(join(process.cwd(), 'prompts/P0-preamble.md'), 'utf8');
    const p5PromptTemplate = readFileSync(join(process.cwd(), 'prompts/P5-claim-extractor.md'), 'utf8');
    const budgetGuard = createInMemoryBudgetGuard({ runCostCapUsd: 0.5, dailyBudgetUsd: 1 });
    const outcomes = await Promise.all(batches.map((batch, index) => extractClaims(`pilot-long-${index}`,
      { sourceTitle: 'Cong et al. 2013', subQuestions: ['What genome editing capabilities did Cong et al. demonstrate?'], passages: batch.map((passage) => ({ passageId: passage.id, locator: passage.locator, text: passage.text })) },
      { metaClient, budgetGuard, p0Preamble, p5PromptTemplate })));
    console.log(JSON.stringify({ type: 'genetic_long_pilot', characters: fullText.length, passages: passages.length, batches: batches.length, outcomes: outcomes.map((result) => result.ok ? { ok: true, claims: result.value.claims.map((claim) => ({ text: claim.text, passageId: claim.passageId })) } : { ok: false, reason: result.detail }) }));
  }, 180_000);

  it.skipIf(process.env.LIVE_GENETIC_LONG_VERIFY !== '1')('reports long-article verification drop reasons', async () => {
    process.loadEnvFile('.env.local');
    const metaClient = createMetaClient({ apiKey: process.env.META_API_KEY!, baseUrl: process.env.META_API_BASE_URL! });
    const europePmc = createEuropePmcClient();
    const fullText = await europePmc.fetchFullText('MED', '23287718');
    if (!fullText) throw new Error('No full text for Cong 2013');
    const result = await extractAndVerifySource({
      runId: 'pilot-long-verify', sourceId: 'MED:23287718', sourceTitle: 'Cong et al. 2013', fullText,
      subQuestions: ['What genome editing capabilities did Cong et al. demonstrate?'], doi: '10.1126/science.1231143',
    }, {
      metaClient, budgetGuard: createInMemoryBudgetGuard({ runCostCapUsd: 0.8, dailyBudgetUsd: 2 }),
      crossref: createCrossrefClient(),
      p0Preamble: readFileSync(join(process.cwd(), 'prompts/P0-preamble.md'), 'utf8'),
      p5PromptTemplate: readFileSync(join(process.cwd(), 'prompts/P5-claim-extractor.md'), 'utf8'),
      p10PromptTemplate: readFileSync(join(process.cwd(), 'prompts/P10-support-judge.md'), 'utf8'),
    });
    console.log(JSON.stringify({ type: 'genetic_long_verification_pilot', status: result.status,
      verified: result.status === 'ok' ? result.claims.map((claim) => claim.text) : [],
      partial: result.status === 'ok' ? result.qualified.map((claim) => claim.text) : [],
      dropped: result.status === 'ok' ? result.dropped : [] }));
  }, 240_000);

  it.skipIf(process.env.LIVE_GENETIC_MUTATIONS !== '1')('probes semantic mutations against the support judge', async () => {
    process.loadEnvFile('.env.local');
    const metaClient = createMetaClient({ apiKey: process.env.META_API_KEY!, baseUrl: process.env.META_API_BASE_URL! });
    const abstract = await createEuropePmcClient().fetchAbstract?.('MED', '22745249');
    if (!abstract) throw new Error('No Jinek abstract');
    const quote = 'the Cas9 HNH nuclease domain cleaves the complementary strand, whereas the Cas9 RuvC-like domain cleaves the noncomplementary strand.';
    const probes = [
      { kind: 'negation', claimText: 'The Cas9 HNH domain does not cleave the complementary strand.' },
      { kind: 'scope', claimText: 'In human cells, the Cas9 HNH domain cleaves the complementary strand.' },
      { kind: 'strength', claimText: 'The Cas9 HNH domain always cleaves the complementary strand in every target.' },
    ];
    const budgetGuard = createInMemoryBudgetGuard({ runCostCapUsd: 0.4, dailyBudgetUsd: 1 });
    const results = await Promise.all(probes.map(async (probe) => ({ kind: probe.kind, result: await judgeSupport(`pilot-mutation-${probe.kind}`,
      { claimText: probe.claimText, conditions: [], quote, surroundingContext: abstract },
      { metaClient, budgetGuard, p0Preamble: readFileSync(join(process.cwd(), 'prompts/P0-preamble.md'), 'utf8'), p10PromptTemplate: readFileSync(join(process.cwd(), 'prompts/P10-support-judge.md'), 'utf8') }) })));
    console.log(JSON.stringify({ type: 'genetic_semantic_mutation_pilot', outcomes: results.map(({ kind, result }) => ({ kind, verdict: result.ok ? result.value.support : result.reason, issues: result.ok ? result.value.issues : [] })) }));
  }, 120_000);
});
