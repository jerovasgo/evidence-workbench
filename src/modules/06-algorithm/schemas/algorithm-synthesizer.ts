import { z } from 'zod';
import { ActionTypeSchema, ConditionSchema, GeneticContextSchema } from '@/shared/domain';
import { AlgorithmGraphSchema } from './algorithm';

// Module 06 `algorithm-synthesizer` agent (P9, T2) contracts
// (docs/architecture/06-algorithm-generator.md). Input claims are slimmed to what
// the model actually needs to decide and cite — not the full `Claim` object (grade/
// verification internals stay server-side, never sent to the model). "Claims are
// given with stable ids; the model must reference ids, never retype claim text as
// evidence" — so `id` is the thing `AlgorithmNode.claimIds` must echo back; code
// verifies every echoed id against the real pool (`validateAlgorithmGraph`'s
// `claim_id_not_in_pool` invariant), never trusted blindly.

export const AlgorithmInputClaimSchema = z.object({
  id: z.string(),
  text: z.string(),
  actionType: ActionTypeSchema,
  conditions: z.array(ConditionSchema),
  geneticContext: GeneticContextSchema.optional(),
});
export type AlgorithmInputClaim = z.infer<typeof AlgorithmInputClaimSchema>;

export const SynthesizeAlgorithmInputSchema = z.object({
  scope: z.string(),
  subQuestions: z.array(z.string()),
  claims: z.array(AlgorithmInputClaimSchema).max(60),
});
export type SynthesizeAlgorithmInput = z.infer<typeof SynthesizeAlgorithmInputSchema>;

// The model's job is exactly the shared `AlgorithmGraph` shape — "shared zod schema
// is used for the model's structured output AND the invariant checker" (architecture
// doc). No separate output schema to drift from it.
export const SynthesizeAlgorithmOutputSchema = AlgorithmGraphSchema;
export type SynthesizeAlgorithmOutput = z.infer<typeof SynthesizeAlgorithmOutputSchema>;
