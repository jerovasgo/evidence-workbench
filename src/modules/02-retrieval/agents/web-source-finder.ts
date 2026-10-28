import type { MetaClient } from '@/shared/meta';
import type { BudgetGuard } from '@/shared/security';

// Module 02 'web'/'guideline' family queries (docs/architecture/02-retrieval.md):
// grounded discovery via the Meta API's own `web_search` tool, NOT a structured
// JSON agent call — DAY0-VERIFICATION.md confirms `web_search_call.results`
// (title/url/snippet) is returned by the API itself, already structured, so there
// is no model-authored JSON to validate against a zod schema here; `runAgent`'s
// repair-retry machinery doesn't apply. This is deliberately a thin wrapper, not a
// full agent: budget-checked and timed like one, but without the schema/retry parts
// that don't fit this call shape.
//
// "Domain restriction not documented for Responses... filter results in code
// against our allow-list" (DAY0-VERIFICATION.md) — the model is asked to prefer
// trusted domains, but the actual filtering happens here in code
// (`execute-plan.ts`), never trusted from the model's own judgment alone.

export interface WebSourceResult {
  title: string;
  url: string;
  snippet: string;
}

export interface FindWebSourcesInput {
  query: string;
  /** Apex domain names (no scheme/subdomain), shown to the model as a preference hint only. */
  preferredDomains: readonly string[];
}

export interface FindWebSourcesDeps {
  metaClient: MetaClient;
  budgetGuard: BudgetGuard;
  maxOutputTokens?: number;
  timeoutMs?: number;
  maxCostUsd?: number;
}

export type FindWebSourcesResult =
  | { ok: true; results: WebSourceResult[] }
  | { ok: false; reason: 'budget' | 'timeout' | 'api_error'; detail: string };

class WebSearchTimeoutError extends Error {}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new WebSearchTimeoutError(`Web search timed out after ${timeoutMs}ms`)), timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer)) as Promise<T>;
}

const DEFAULT_MAX_OUTPUT_TOKENS = 1000;
const DEFAULT_TIMEOUT_MS = 20000;
const DEFAULT_MAX_COST_USD = 0.05;
const MODEL = 'muse-spark-1.3';

export async function findWebSources(
  runId: string,
  input: FindWebSourcesInput,
  deps: FindWebSourcesDeps,
): Promise<FindWebSourcesResult> {
  const maxCostUsd = deps.maxCostUsd ?? DEFAULT_MAX_COST_USD;
  const budgetCheck = deps.budgetGuard.check(runId, maxCostUsd);
  if (!budgetCheck.allowed) {
    return { ok: false, reason: 'budget', detail: budgetCheck.reason };
  }

  const prompt =
    `Search the web for pages that answer this clinical evidence query: "${input.query}". ` +
    `Strongly prefer official sources on these domains when relevant results exist: ${input.preferredDomains.join(', ')}. ` +
    'Do not answer the question yourself; only search and let the results speak.';

  try {
    const result = await withTimeout(
      deps.metaClient.respond({
        model: MODEL,
        reasoningEffort: 'minimal',
        input: [{ role: 'user', content: prompt }],
        tools: ['web_search'],
        includeWebSearchResults: true,
        maxOutputTokens: deps.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS,
      }),
      deps.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    );
    deps.budgetGuard.record(runId, result.costUsd);
    return { ok: true, results: result.webSearchResults };
  } catch (err) {
    if (err instanceof WebSearchTimeoutError) {
      return { ok: false, reason: 'timeout', detail: err.message };
    }
    return { ok: false, reason: 'api_error', detail: err instanceof Error ? err.message : String(err) };
  }
}
