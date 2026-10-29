import { runAgent, type AgentResult, type AgentTraceEvent } from '@/shared/agents';
import type { MetaClient } from '@/shared/meta';
import type { BudgetGuard } from '@/shared/security';
import {
  ExtractClaimsInputSchema,
  ExtractClaimsOutputSchema,
  type ExtractClaimsInput,
  type ExtractClaimsOutput,
} from '../schemas/extraction';

// Module 03 `claim-extractor` agent (P5): one call per source (passages + sub-
// questions batched together), run in parallel across sources by the caller.
// Deterministic verification (`verify-claim.ts`) runs afterward, in the caller — it
// is code, not part of this model call.

export interface ExtractClaimsDeps {
  metaClient: MetaClient;
  budgetGuard: BudgetGuard;
  p0Preamble: string;
  p5PromptTemplate: string;
  onTrace?: (event: AgentTraceEvent) => void;
}

export async function extractClaims(
  runId: string,
  input: ExtractClaimsInput,
  deps: ExtractClaimsDeps,
): Promise<AgentResult<ExtractClaimsOutput>> {
  const parsed = ExtractClaimsInputSchema.parse(input);

  const prompt = deps.p5PromptTemplate
    .replace('{{source_title}}', parsed.sourceTitle)
    .replace('{{sub_questions}}', JSON.stringify(parsed.subQuestions))
    .replace('{{passages}}', JSON.stringify(parsed.passages));

  return runAgent({
    name: 'claim-extractor',
    promptVersion: 'P5@0.4',
    tier: 'T1',
    systemPreamble: deps.p0Preamble,
    prompt,
    outputSchema: ExtractClaimsOutputSchema,
    limits: { maxOutputTokens: 3000, timeoutMs: 25000, maxCostUsd: 0.08 },
    ctx: { runId, metaClient: deps.metaClient, budgetGuard: deps.budgetGuard, onTrace: deps.onTrace },
  });
}
