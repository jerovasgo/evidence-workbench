import path from 'node:path';
import { createSupabaseRunsRepository, type RunsRepository } from '../data/runs-repository';
import { createSupabaseStageOutputsRepository, type StageOutputsRepository } from '../data/stage-outputs-repository';
import { createSupabaseConversationsRepository, type ConversationsRepository } from '../data/conversations-repository';
import { createMetaClient, type MetaClient } from '@/shared/meta';
import { loadPromptBody } from '@/shared/prompts';
import { createInMemoryBudgetGuard, createSingleKeyKeyring, loadEncryptionKey, type BudgetGuard } from '@/shared/security';
import { createServiceRoleClient } from '@/shared/supabase';
import { createCrossrefClient, createEuropePmcClient, createPubmedClient, type CrossrefClient, type EuropePmcClient, type PubmedClient } from '@/modules/02-retrieval';
import { createPendingRunContextStore, type PendingRunContextStore } from './pending-run-context';

// One runtime per server process, built lazily on first request and reused after
// that — this is what keeps the budget guard's daily counter meaningful across
// requests (module 10). It resets on redeploy/restart and is not shared across
// instances; SECURITY.md tracks that as a known Day-1 limitation until the
// Postgres-backed budget_ledger is wired in.

export interface ServerRuntime {
  metaClient: MetaClient;
  budgetGuard: BudgetGuard;
  runsRepository: RunsRepository;
  stageOutputsRepository: StageOutputsRepository;
  conversationsRepository: ConversationsRepository;
  dailyBudgetUsd: number;
  p0Preamble: string;
  p1PromptTemplate: string;
  p2PromptTemplate: string;
  p3PromptTemplate: string;
  p4PromptTemplate: string;
  p5PromptTemplate: string;
  p7PromptTemplate: string;
  p10PromptTemplate: string;
  pubmed: PubmedClient;
  europePmc: EuropePmcClient;
  crossref: CrossrefClient;
  pendingRunContext: PendingRunContextStore;
}

let singleton: ServerRuntime | null = null;

function readRequiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required but not set`);
  }
  return value;
}

function readPositiveNumberEnv(name: string): number {
  const raw = readRequiredEnv(name);
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${name} must be a positive number, got "${raw}"`);
  }
  return value;
}

export function buildServerRuntime(): ServerRuntime {
  const metaApiKey = readRequiredEnv('META_API_KEY');
  const metaApiBaseUrl = readRequiredEnv('META_API_BASE_URL');
  const supabaseUrl = readRequiredEnv('SUPABASE_URL');
  const serviceRoleKey = readRequiredEnv('SUPABASE_SERVICE_ROLE_KEY');
  const appEncryptionKey = readRequiredEnv('APP_ENCRYPTION_KEY');
  const dailyBudgetUsd = readPositiveNumberEnv('DAILY_BUDGET_USD');
  const runCostCapUsd = readPositiveNumberEnv('RUN_COST_CAP_USD');

  const metaClient = createMetaClient({ apiKey: metaApiKey, baseUrl: metaApiBaseUrl });
  const supabase = createServiceRoleClient({ url: supabaseUrl, serviceRoleKey });
  const runsRepository = createSupabaseRunsRepository(supabase);
  const stageOutputsRepository = createSupabaseStageOutputsRepository(supabase);
  // First real wiring of module 10's field encryption into a route handler (built
  // 2026-10-27, unused until now) — the conversation-history feature's scoped
  // exception to CLAUDE.md rule 3 (docs/DECISIONS.md) is what finally needs it.
  const encryptionKeyring = createSingleKeyKeyring(loadEncryptionKey(appEncryptionKey));
  const conversationsRepository = createSupabaseConversationsRepository(supabase, encryptionKeyring);
  const budgetGuard = createInMemoryBudgetGuard({ runCostCapUsd, dailyBudgetUsd });

  // NCBI_API_KEY is optional: without it PubMed is limited to 3 req/s (module 02's
  // pubmed.ts); a live smoke test of the full retrieval pipeline showed occasional
  // HTTP 429s from esummary even within that documented limit under concurrent
  // queries, so a key (raises the limit to ~9/s) is worth configuring for the demo.
  const ncbiApiKey = process.env.NCBI_API_KEY || undefined;
  const pubmed = createPubmedClient({ apiKey: ncbiApiKey });
  const europePmc = createEuropePmcClient();
  const crossref = createCrossrefClient();
  const pendingRunContext = createPendingRunContextStore();

  const promptsDir = path.join(process.cwd(), 'prompts');
  const loadPrompt = (name: string) => loadPromptBody(path.join(promptsDir, name));
  const p0Preamble = loadPrompt('P0-preamble.md');
  const p1PromptTemplate = loadPrompt('P1-intent-router.md');
  const p2PromptTemplate = loadPrompt('P2-scenario-structurer.md');
  const p3PromptTemplate = loadPrompt('P3-search-planner.md');
  const p4PromptTemplate = loadPrompt('P4-source-classifier.md');
  const p5PromptTemplate = loadPrompt('P5-claim-extractor.md');
  const p7PromptTemplate = loadPrompt('P7-relation-labeller.md');
  const p10PromptTemplate = loadPrompt('P10-support-judge.md');

  return {
    metaClient,
    budgetGuard,
    runsRepository,
    stageOutputsRepository,
    conversationsRepository,
    dailyBudgetUsd,
    p0Preamble,
    p1PromptTemplate,
    p2PromptTemplate,
    p3PromptTemplate,
    p4PromptTemplate,
    p5PromptTemplate,
    p7PromptTemplate,
    p10PromptTemplate,
    pubmed,
    europePmc,
    crossref,
    pendingRunContext,
  };
}

export function getServerRuntime(): ServerRuntime {
  singleton ??= buildServerRuntime();
  return singleton;
}

/** Test-only: forces the next getServerRuntime() call to rebuild from current env. */
export function resetServerRuntimeForTests(): void {
  singleton = null;
}
