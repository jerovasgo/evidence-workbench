import { z } from 'zod';
import { runAgent, type AgentResult, type AgentTraceEvent } from '@/shared/agents';
import type { MetaClient } from '@/shared/meta';
import type { BudgetGuard } from '@/shared/security';
import { SearchPlanSchema, type SearchPlan } from '../schemas/retrieval';

// Module 02 `search-planner` agent (P3). Module 01's `scenario-structurer` (P2) is
// not built yet, so the input here is a simplified stand-in (condition + optional
// sub-questions) rather than the full structured-scenario object module 02 describes
// — callers pass what they have today; this narrows further once P2 exists.

export const SearchPlannerInputSchema = z.object({
  condition: z.string().min(1),
  subQuestions: z.array(z.string()).max(6).optional(),
  setting: z.string().optional(),
  country: z.string().optional(),
});
export type SearchPlannerInput = z.infer<typeof SearchPlannerInputSchema>;

export interface PlanSearchDeps {
  metaClient: MetaClient;
  budgetGuard: BudgetGuard;
  p0Preamble: string;
  p3PromptTemplate: string;
  onTrace?: (event: AgentTraceEvent) => void;
}

export async function planSearch(
  runId: string,
  input: SearchPlannerInput,
  deps: PlanSearchDeps,
): Promise<AgentResult<SearchPlan>> {
  const parsed = SearchPlannerInputSchema.parse(input);

  const prompt = deps.p3PromptTemplate
    .replace('{{condition}}', parsed.condition)
    .replace('{{sub_questions}}', JSON.stringify(parsed.subQuestions ?? []))
    .replace('{{setting}}', parsed.setting ?? 'unknown')
    .replace('{{country}}', parsed.country ?? 'unknown');

  return runAgent({
    name: 'search-planner',
    promptVersion: 'P3@0.1',
    tier: 'T0',
    systemPreamble: deps.p0Preamble,
    prompt,
    outputSchema: SearchPlanSchema,
    // Module 02 sketches 1,200 output tokens; the router agent's (P1) sketched budget
    // turned out too small once reasoning-token usage was measured live
    // (docs/DAY0-VERIFICATION.md) — this starts higher and should be re-checked the
    // same way rather than trusted as final.
    limits: { maxOutputTokens: 2000, timeoutMs: 15000, maxCostUsd: 0.03 },
    ctx: { runId, metaClient: deps.metaClient, budgetGuard: deps.budgetGuard, onTrace: deps.onTrace },
  });
}
