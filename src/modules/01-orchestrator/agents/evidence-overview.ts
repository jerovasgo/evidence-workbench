import { z } from 'zod';
import { runAgent } from '@/shared/agents';
import type { Claim } from '@/shared/domain';
import type { MetaClient } from '@/shared/meta';
import type { BudgetGuard } from '@/shared/security';

export async function synthesizeEvidenceOverview(runId: string, query: string, claims: Claim[], deps: { metaClient: MetaClient; budgetGuard: BudgetGuard; p0Preamble: string }): Promise<string | null> {
  const evidence = claims.slice(0, 12).map((claim) => ({ id: claim.id, source: claim.sourceId, finding: claim.text, context: claim.geneticContext }));
  const result = await runAgent({ name: 'evidence-overview', promptVersion: 'overview@0.1', tier: 'T0', systemPreamble: deps.p0Preamble,
    prompt: `Answer the research question in its original language in 60-100 words. Use ONLY the supplied verified findings. For a comparison, state the concrete differences in experimental model, perturbation and outcome when reported. Explicitly distinguish missing information from disagreement. Do not infer consensus, causality, clinical advice or direct comparability. End with one useful research implication or limitation. No process narration. Return {text, claimIds}, citing the supplied IDs in claimIds. Question: ${JSON.stringify(query)}\nEvidence: ${JSON.stringify(evidence)}`,
    outputSchema: z.object({ text: z.string().min(1).max(1200), claimIds: z.array(z.string()).min(1) }),
    limits: { maxOutputTokens: 1200, timeoutMs: 10000, maxCostUsd: 0.02 }, ctx: { runId, ...deps } });
  if (!result.ok || result.value.claimIds.some((id) => !evidence.some((claim) => claim.id === id))) return null;
  return result.value.text;
}
