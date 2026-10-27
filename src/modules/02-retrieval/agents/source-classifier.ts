import { runAgent, type AgentResult, type AgentTraceEvent } from '@/shared/agents';
import type { MetaClient } from '@/shared/meta';
import type { BudgetGuard } from '@/shared/security';
import {
  ClassifySourcesInputSchema,
  ClassifySourcesOutputSchema,
  type ClassifySourcesInput,
  type ClassifySourcesOutput,
} from '../schemas/classification';

// Module 02 `source-classifier` agent (P4): batched, ≤40 items/call, parallel.
// applyPubmedTypeOverride (classification/pubmed-type-override.ts) runs on this
// agent's output afterward, in the caller — it is deterministic code, not part of
// the model call, and is not applied inside this function.

export interface ClassifySourcesDeps {
  metaClient: MetaClient;
  budgetGuard: BudgetGuard;
  p0Preamble: string;
  p4PromptTemplate: string;
  onTrace?: (event: AgentTraceEvent) => void;
}

export async function classifySources(
  runId: string,
  input: ClassifySourcesInput,
  deps: ClassifySourcesDeps,
): Promise<AgentResult<ClassifySourcesOutput>> {
  const parsed = ClassifySourcesInputSchema.parse(input);

  const prompt = deps.p4PromptTemplate.replace('{{sources_json}}', JSON.stringify(parsed.sources));

  return runAgent({
    name: 'source-classifier',
    promptVersion: 'P4@0.1',
    tier: 'T0',
    systemPreamble: deps.p0Preamble,
    prompt,
    outputSchema: ClassifySourcesOutputSchema,
    // Batched up to 40 sources/call — scale the token budget with batch size rather
    // than a single fixed number; ~120 tokens/source is a starting estimate to be
    // re-checked live (see search-planner.ts's note on the same issue).
    limits: {
      maxOutputTokens: Math.max(1500, parsed.sources.length * 120),
      timeoutMs: 20000,
      maxCostUsd: 0.05,
    },
    ctx: { runId, metaClient: deps.metaClient, budgetGuard: deps.budgetGuard, onTrace: deps.onTrace },
  });
}
