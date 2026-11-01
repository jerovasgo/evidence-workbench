import { runAgent, type AgentResult, type AgentTraceEvent } from '@/shared/agents';
import type { MetaClient } from '@/shared/meta';
import type { BudgetGuard } from '@/shared/security';
import {
  SynthesizeMechanismInputSchema,
  SynthesizeMechanismOutputSchema,
  type SynthesizeMechanismInput,
  type SynthesizeMechanismOutput,
} from '../schemas/mechanism-synthesizer';

// Module 08 `mechanism-synthesizer` agent (P16, T2). Single-call primitive — the
// pipeline layer (`pipeline/synthesize-mechanism.ts`) is what adds the one manual
// invariant-repair call on top, by calling this function again with `violations` set.
// Mirrors `06-algorithm/agents/algorithm-synthesizer.ts` exactly.

export interface SynthesizeMechanismDeps {
  metaClient: MetaClient;
  budgetGuard: BudgetGuard;
  p0Preamble: string;
  p16PromptTemplate: string;
  onTrace?: (event: AgentTraceEvent) => void;
}

export async function synthesizeMechanismGraph(
  runId: string,
  input: SynthesizeMechanismInput,
  deps: SynthesizeMechanismDeps,
  /** Set on the one manual repair attempt: the invariant violations from the first try, appended to the prompt. */
  violations?: string,
): Promise<AgentResult<SynthesizeMechanismOutput>> {
  const parsed = SynthesizeMechanismInputSchema.parse(input);

  let prompt = deps.p16PromptTemplate
    .replace('{{scope}}', parsed.scope)
    .replace('{{sub_questions}}', JSON.stringify(parsed.subQuestions))
    .replace('{{claims_json}}', JSON.stringify(parsed.claims));
  if (violations) {
    prompt += `\n<violations>Your previous graph failed these structural checks — fix them without changing anything else that already passed: ${violations}</violations>`;
  }

  return runAgent({
    name: 'mechanism-synthesizer',
    promptVersion: 'P16@0.1',
    tier: 'T2',
    systemPreamble: deps.p0Preamble,
    prompt,
    outputSchema: SynthesizeMechanismOutputSchema,
    // Architecture doc's own sketch: ~6,000 output tokens for a whole graph, scaled
    // a little with claim count since more claims can support more entities/interactions.
    limits: { maxOutputTokens: Math.max(6000, parsed.claims.length * 150), timeoutMs: 30000, maxCostUsd: 0.15 },
    ctx: { runId, metaClient: deps.metaClient, budgetGuard: deps.budgetGuard, onTrace: deps.onTrace },
  });
}
