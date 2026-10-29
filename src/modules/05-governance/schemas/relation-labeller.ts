import { z } from 'zod';
import { GeneticContextSchema, RelationSchema } from '@/shared/domain';

// Module 05 `relation-labeller` agent (P7, T1, batched <=10 pairs/call —
// docs/architecture/05-governance-local-vs-external.md). Code pairs claims and
// assigns each pair a `pairId` (its index in the batch); the model only ever
// echoes `pairId` back, never a claim id — `src/modules/05-governance/agents/
// relation-labeller.ts` reconstructs the real `from`/`to` claim ids from the
// original pair list it already controls, so a hallucinated id can never reach
// `Relation` data ("model proposes, code verifies").

export const RelationCandidatePairSchema = z.object({
  pairId: z.number().int().nonnegative(),
  claimAText: z.string(),
  claimAQuote: z.string(),
  claimBText: z.string(),
  claimBQuote: z.string(),
  claimAContext: GeneticContextSchema.optional(),
  claimBContext: GeneticContextSchema.optional(),
});
export type RelationCandidatePair = z.infer<typeof RelationCandidatePairSchema>;

export const LabelRelationsInputSchema = z.object({
  pairs: z.array(RelationCandidatePairSchema).max(10),
});
export type LabelRelationsInput = z.infer<typeof LabelRelationsInputSchema>;

/** Omit a pair entirely from `relations` when the relation is unclear — never guess. */
export const RelationVerdictSchema = z.object({
  pairId: z.number().int().nonnegative(),
  kind: RelationSchema.shape.kind,
  evidence: z.string().min(1),
});
export type RelationVerdict = z.infer<typeof RelationVerdictSchema>;

export const LabelRelationsOutputSchema = z.object({
  relations: z.array(RelationVerdictSchema),
});
export type LabelRelationsOutput = z.infer<typeof LabelRelationsOutputSchema>;
