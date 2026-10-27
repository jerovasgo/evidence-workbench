import { z } from 'zod';
import { runAgent, type AgentResult, type AgentTraceEvent } from '@/shared/agents';
import type { MetaClient } from '@/shared/meta';
import type { BudgetGuard } from '@/shared/security';
import { ScenarioStructureSchema, type ScenarioStructure } from '../schemas/scenario-structure';

// Module 01 `scenario-structurer` agent (P2): "Converts the condition/scenario into
// PICO-like structure ... shown to the user as editable chips before expensive
// stages when the run is interactive; skipped for precomputed runs and watches."
// This function only produces the structure — showing it as editable chips and the
// precomputed/watch skip are callers' responsibility (module 11/09), not this agent's.

export const StructureScenarioInputSchema = z.object({
  freeText: z.string().min(1).max(1500),
  condition: z.string().optional(),
  setting: z.string().optional(),
});
export type StructureScenarioInput = z.infer<typeof StructureScenarioInputSchema>;

export interface StructureScenarioDeps {
  metaClient: MetaClient;
  budgetGuard: BudgetGuard;
  p0Preamble: string;
  p2PromptTemplate: string;
  onTrace?: (event: AgentTraceEvent) => void;
}

export async function structureScenario(
  runId: string,
  input: StructureScenarioInput,
  deps: StructureScenarioDeps,
): Promise<AgentResult<ScenarioStructure>> {
  const parsed = StructureScenarioInputSchema.parse(input);

  const prompt = deps.p2PromptTemplate
    .replace('{{free_text}}', parsed.freeText)
    .replace('{{condition}}', parsed.condition ?? 'unknown')
    .replace('{{setting}}', parsed.setting ?? 'unknown');

  return runAgent({
    name: 'scenario-structurer',
    promptVersion: 'P2@0.1',
    tier: 'T0',
    systemPreamble: deps.p0Preamble,
    prompt,
    outputSchema: ScenarioStructureSchema,
    // Starting budget mirrors the router's (P1) post-live-test values rather than
    // module 01's un-verified sketch, since both are single-step T0 agents of similar
    // output size; re-checked live below like every other agent in this project.
    limits: { maxOutputTokens: 1000, timeoutMs: 10000, maxCostUsd: 0.02 },
    ctx: { runId, metaClient: deps.metaClient, budgetGuard: deps.budgetGuard, onTrace: deps.onTrace },
  });
}
