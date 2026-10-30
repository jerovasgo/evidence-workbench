import { runAgent, type AgentResult, type AgentTraceEvent } from '@/shared/agents';
import type { MetaClient } from '@/shared/meta';
import type { BudgetGuard } from '@/shared/security';
import type { Relation } from '@/shared/domain';
import type { ClaimPair } from '../pipeline/pair-claims';
import {
  LabelRelationsInputSchema,
  LabelRelationsOutputSchema,
  type RelationCandidatePair,
} from '../schemas/relation-labeller';

// Module 05 `relation-labeller` agent (P7, T1, batched <=10 pairs/call). Code
// assigns each pair an opaque `pairId` (its index in this call's batch) and is
// the only thing that ever turns a validated `pairId` back into a real claim-id
// `Relation.from`/`to` — the model only ever echoes `pairId`, never a claim id,
// so a hallucinated endpoint can never reach `Relation` data ("model proposes,
// code verifies"). Single-call primitive; `label-relations-batched.ts` is the
// pooling layer on top, mirroring `classifySourcesBatched`.

export interface LabelRelationsDeps {
  metaClient: MetaClient;
  budgetGuard: BudgetGuard;
  p0Preamble: string;
  p7PromptTemplate: string;
  onTrace?: (event: AgentTraceEvent) => void;
}

export interface LabelRelationsBatchResult {
  relations: Relation[];
}

function toCandidatePair(pairId: number, pair: ClaimPair): RelationCandidatePair {
  return {
    pairId,
    claimAText: pair.a.text,
    claimAQuote: pair.a.quote,
    claimBText: pair.b.text,
    claimBQuote: pair.b.quote,
    claimAContext: pair.a.geneticContext,
    claimBContext: pair.b.geneticContext,
  };
}

// Literal matching supplies an audit trail; different wording is not treated as
// proof of biological difference or as a reason to discard a candidate relation.
function assessContext(pair: ClaimPair): NonNullable<Relation['contextAssessment']> {
  const fields = ['gene', 'organism', 'model', 'perturbation', 'measurement'] as const;
  const matching: string[] = [];
  const different: string[] = [];
  const missing: string[] = [];
  for (const field of fields) {
    const a = pair.a.geneticContext?.[field]?.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase();
    const b = pair.b.geneticContext?.[field]?.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase();
    if (!a || !b) missing.push(field);
    else if (a === b) matching.push(field);
    else different.push(field);
  }
  return { status: different.length || missing.length ? 'review_needed' : 'matching', matching, different, missing };
}

export async function labelRelations(
  runId: string,
  pairs: ClaimPair[],
  deps: LabelRelationsDeps,
): Promise<AgentResult<LabelRelationsBatchResult>> {
  const candidates = pairs.map((pair, pairId) => toCandidatePair(pairId, pair));
  const parsedInput = LabelRelationsInputSchema.parse({ pairs: candidates });

  const prompt = deps.p7PromptTemplate.replace('{{pairs_json}}', JSON.stringify(parsedInput.pairs));

  const result = await runAgent({
    name: 'relation-labeller',
    promptVersion: 'P7@0.4',
    tier: 'T0',
    systemPreamble: deps.p0Preamble,
    prompt,
    outputSchema: LabelRelationsOutputSchema,
    // Batched up to 10 pairs/call (architecture doc's own limit) — budget scales
    // with batch size the same way source-classifier.ts does for its own batches.
    limits: {
      maxOutputTokens: Math.max(3000, pairs.length * 400),
      timeoutMs: 20000,
      maxCostUsd: 0.05,
    },
    ctx: { runId, metaClient: deps.metaClient, budgetGuard: deps.budgetGuard, onTrace: deps.onTrace },
  });

  if (!result.ok) return result;

  const relations: Relation[] = [];
  for (const verdict of result.value.relations) {
    const pair = pairs[verdict.pairId];
    // An out-of-range pairId is an invalid echo, not a real pair — drop it rather
    // than ever trusting a model-supplied index into claim data.
    if (!pair) continue;
    relations.push({ from: pair.a.id, to: pair.b.id, kind: verdict.kind, evidence: verdict.evidence, contextAssessment: assessContext(pair) });
  }

  return { ok: true, value: { relations }, usage: result.usage };
}
