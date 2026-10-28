import { runAgent, type AgentResult, type AgentTraceEvent } from '@/shared/agents';
import type { MetaClient } from '@/shared/meta';
import type { BudgetGuard } from '@/shared/security';
import {
  JudgeSupportInputSchema,
  JudgeSupportOutputSchema,
  type JudgeSupportInput,
  type JudgeSupportOutput,
} from '../schemas/support-judge';

// Module 03 `support-judge` agent (P10): the last verification step — judges a
// single already-quote-verified claim against its surrounding context. T2 (high
// reasoning effort), since this is the "careful" tier, not the cheap one — it is
// what decides whether a claim can ever become `verified`.

export interface JudgeSupportDeps {
  metaClient: MetaClient;
  budgetGuard: BudgetGuard;
  p0Preamble: string;
  p10PromptTemplate: string;
  onTrace?: (event: AgentTraceEvent) => void;
}

export async function judgeSupport(
  runId: string,
  input: JudgeSupportInput,
  deps: JudgeSupportDeps,
): Promise<AgentResult<JudgeSupportOutput>> {
  const parsed = JudgeSupportInputSchema.parse(input);

  const prompt = deps.p10PromptTemplate
    .replace('{{claim_text}}', parsed.claimText)
    .replace('{{conditions_json}}', JSON.stringify(parsed.conditions))
    .replace('{{quote}}', parsed.quote)
    .replace('{{surrounding_context}}', parsed.surroundingContext);

  return runAgent({
    name: 'support-judge',
    promptVersion: 'P10@0.1',
    tier: 'T2',
    systemPreamble: deps.p0Preamble,
    prompt,
    outputSchema: JudgeSupportOutputSchema,
    // Module 03 sketches 400 output tokens; a live smoke test showed T2 ('high'
    // reasoning effort) alone consumes 600+ tokens on reasoning before any JSON is
    // emitted, even for a short prompt — the same reasoning-token-budget surprise
    // already hit for the router (P1) and raised there. Starts higher here instead
    // of repeating that discovery the hard way.
    limits: { maxOutputTokens: 1500, timeoutMs: 20000, maxCostUsd: 0.04 },
    ctx: { runId, metaClient: deps.metaClient, budgetGuard: deps.budgetGuard, onTrace: deps.onTrace },
  });
}
