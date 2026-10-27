import { z } from 'zod';

export const ConditionSchema = z.object({
  variable: z.string(),
  op: z.enum(['<', '>', '=', 'in']),
  value: z.union([z.string(), z.number()]),
  unit: z.string().optional(),
});
export type Condition = z.infer<typeof ConditionSchema>;

export const GradeSchema = z.object({
  certainty: z.enum(['high', 'moderate', 'low', 'very_low', 'ungraded']),
  strength: z
    .object({
      direction: z.enum(['for', 'against']),
      level: z.enum(['strong', 'conditional']),
    })
    .optional(),
  origin: z.enum(['source', 'ai_estimated']),
  nativeGrade: z.string().optional(),
  domains: z.record(z.string(), z.object({ rating: z.string(), reason: z.string() })).optional(),
});
export type Grade = z.infer<typeof GradeSchema>;

export const ActionTypeSchema = z.enum([
  'assess',
  'test',
  'treat',
  'threshold',
  'disposition',
  'avoid',
  'mechanism',
]);
export type ActionType = z.infer<typeof ActionTypeSchema>;

export const ClaimVerificationSchema = z.object({
  exists: z.boolean(),
  quoteFound: z.boolean(),
  retracted: z.boolean(),
  support: z.enum(['supports', 'partial', 'no', 'unknown']),
});
export type ClaimVerification = z.infer<typeof ClaimVerificationSchema>;

export const ClaimSchema = z.object({
  id: z.string(),
  text: z.string(),
  basis: z.enum(['recommendation', 'background']),
  actionType: ActionTypeSchema,
  conditions: z.array(ConditionSchema),
  sourceId: z.string(),
  passageId: z.string(),
  quote: z.string(),
  grade: GradeSchema,
  verification: ClaimVerificationSchema,
  safetyCritical: z.boolean(),
});
export type Claim = z.infer<typeof ClaimSchema>;

/**
 * SPEC §8 invariant: every displayed Claim has quoteFound = true. This is enforced by
 * validators (module 03), not here — this helper only narrows the type for code that
 * already holds a verified claim.
 */
export const VerifiedClaimSchema = ClaimSchema.refine((claim) => claim.verification.quoteFound, {
  message: 'A VerifiedClaim must have verification.quoteFound = true',
});
export type VerifiedClaim = z.infer<typeof VerifiedClaimSchema>;
