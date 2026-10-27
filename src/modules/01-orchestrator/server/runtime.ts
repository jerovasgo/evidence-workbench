import path from 'node:path';
import { createSupabaseRunsRepository, type RunsRepository } from '../data/runs-repository';
import { createMetaClient, type MetaClient } from '@/shared/meta';
import { loadPromptBody } from '@/shared/prompts';
import { createInMemoryBudgetGuard, type BudgetGuard } from '@/shared/security';
import { createServiceRoleClient } from '@/shared/supabase';

// One runtime per server process, built lazily on first request and reused after
// that — this is what keeps the budget guard's daily counter meaningful across
// requests (module 10). It resets on redeploy/restart and is not shared across
// instances; SECURITY.md tracks that as a known Day-1 limitation until the
// Postgres-backed budget_ledger is wired in.

export interface ServerRuntime {
  metaClient: MetaClient;
  budgetGuard: BudgetGuard;
  runsRepository: RunsRepository;
  dailyBudgetUsd: number;
  p0Preamble: string;
  p1PromptTemplate: string;
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
  const dailyBudgetUsd = readPositiveNumberEnv('DAILY_BUDGET_USD');
  const runCostCapUsd = readPositiveNumberEnv('RUN_COST_CAP_USD');

  const metaClient = createMetaClient({ apiKey: metaApiKey, baseUrl: metaApiBaseUrl });
  const supabase = createServiceRoleClient({ url: supabaseUrl, serviceRoleKey });
  const runsRepository = createSupabaseRunsRepository(supabase);
  const budgetGuard = createInMemoryBudgetGuard({ runCostCapUsd, dailyBudgetUsd });

  const promptsDir = path.join(process.cwd(), 'prompts');
  const p0Preamble = loadPromptBody(path.join(promptsDir, 'P0-preamble.md'));
  const p1PromptTemplate = loadPromptBody(path.join(promptsDir, 'P1-intent-router.md'));

  return { metaClient, budgetGuard, runsRepository, dailyBudgetUsd, p0Preamble, p1PromptTemplate };
}

export function getServerRuntime(): ServerRuntime {
  singleton ??= buildServerRuntime();
  return singleton;
}

/** Test-only: forces the next getServerRuntime() call to rebuild from current env. */
export function resetServerRuntimeForTests(): void {
  singleton = null;
}
