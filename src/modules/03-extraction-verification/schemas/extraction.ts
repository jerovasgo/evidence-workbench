import { z } from 'zod';
import { ActionTypeSchema, ConditionSchema } from '@/shared/domain';

// Module 03 `claim-extractor` agent (P5) contracts
// (docs/architecture/03-claim-extraction-and-verification.md). Output omits
// `id`/`sourceId`/`grade`/`verification` — code fills those (`verify-claim.ts`
// constructs the real `Claim`; grading is module 04's job, not built yet).

export const PassageInputSchema = z.object({
  passageId: z.string(),
  locator: z.string(),
  text: z.string(),
});
export type PassageInput = z.infer<typeof PassageInputSchema>;

export const ExtractClaimsInputSchema = z.object({
  sourceTitle: z.string(),
  passages: z.array(PassageInputSchema).min(1),
  subQuestions: z.array(z.string()).max(6),
});
export type ExtractClaimsInput = z.infer<typeof ExtractClaimsInputSchema>;

export const ExtractedClaimSchema = z.object({
  /** Clinician-addressed ("assess", "consider ordering"), target <=35 words. */
  text: z.string().min(1).max(280),
  basis: z.enum(['recommendation', 'background']),
  actionType: ActionTypeSchema,
  conditions: z.array(ConditionSchema),
  /** Verbatim from the cited passage, <=300 chars — never paraphrased. */
  quote: z.string().min(1).max(300),
  /** Must be one of the input passages' `passageId`; code checks this, not the model. */
  passageId: z.string(),
  nativeGrade: z.string().optional(),
  /** Model's own proposal; code can only raise this later, never lower it. */
  safetyCritical: z.boolean(),
});
export type ExtractedClaim = z.infer<typeof ExtractedClaimSchema>;

export const ExtractClaimsOutputSchema = z.object({ claims: z.array(ExtractedClaimSchema) });
export type ExtractClaimsOutput = z.infer<typeof ExtractClaimsOutputSchema>;
