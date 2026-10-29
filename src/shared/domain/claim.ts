import { z } from 'zod';

export const ConditionSchema = z.object({
  variable: z.string(),
  op: z.enum(['<', '>', '=', 'in']),
  value: z.union([z.string(), z.number()]),
  unit: z.string().optional(),
});
export type Condition = z.infer<typeof ConditionSchema>;

// 2026-10-29 pivot (docs/DECISIONS.md): `strength` (clinical recommendation
// strength — "strong/conditional, for/against") is dropped, not kept-but-unused —
// it has no general-science analog. `certainty` survives unchanged: high/moderate/
// low/very_low/ungraded is already generically meaningful evidence-certainty
// language despite its GRADE origin.
export const GradeSchema = z.object({
  certainty: z.enum(['high', 'moderate', 'low', 'very_low', 'ungraded']),
  origin: z.enum(['source', 'ai_estimated']),
  nativeGrade: z.string().optional(),
  domains: z.record(z.string(), z.object({ rating: z.string(), reason: z.string() })).optional(),
});
export type Grade = z.infer<typeof GradeSchema>;

// 2026-10-29 pivot: replaces the clinical-workflow verbs (assess/test/treat/
// threshold/disposition/avoid) with a general-science claim taxonomy. `mechanism`
// is unchanged (feeds module 08 either way).
export const ActionTypeSchema = z.enum([
  'finding',
  'method',
  'measurement',
  'theory',
  'mechanism',
  'limitation',
]);
export type ActionType = z.infer<typeof ActionTypeSchema>;

export const SupportIssueSchema = z.enum([
  'negation',
  'wrong_scope',
  'wrong_threshold',
  'wrong_strength',
  'out_of_context',
  'other',
]);
export type SupportIssue = z.infer<typeof SupportIssueSchema>;

/** Exact text fragments from the claim's quotation; missing context remains unknown. */
export const GeneticContextSchema = z.object({
  gene: z.string().min(1).max(150).optional(),
  organism: z.string().min(1).max(150).optional(),
  model: z.string().min(1).max(150).optional(),
  perturbation: z.string().min(1).max(150).optional(),
  measurement: z.string().min(1).max(150).optional(),
  effect: z.string().min(1).max(150).optional(),
});
export type GeneticContext = z.infer<typeof GeneticContextSchema>;

export const ClaimVerificationSchema = z.object({
  exists: z.boolean(),
  quoteFound: z.boolean(),
  retracted: z.boolean(),
  support: z.enum(['supports', 'partial', 'no', 'unknown']),
  retractionCheck: z.literal('crossref_no_signal').optional(),
  /** Only set when support-judge actually ran (module 03, P10); explains a 'partial' or 'no' verdict — SPEC: "partial -> show with visible caveat". */
  supportIssues: z.array(SupportIssueSchema).optional(),
  supportNote: z.string().optional(),
});
export type ClaimVerification = z.infer<typeof ClaimVerificationSchema>;

export const ClaimSchema = z.object({
  id: z.string(),
  text: z.string(),
  basis: z.enum(['primary', 'background']),
  actionType: ActionTypeSchema,
  conditions: z.array(ConditionSchema),
  subQuestionIndex: z.number().int().nonnegative().max(5).optional(),
  geneticContext: GeneticContextSchema.optional(),
  sourceId: z.string(),
  passageId: z.string(),
  quote: z.string(),
  grade: GradeSchema,
  verification: ClaimVerificationSchema,
  safetyCritical: z.boolean(),
});
export type Claim = z.infer<typeof ClaimSchema>;

/**
 * SPEC §8 / docs/architecture/03-claim-extraction-and-verification.md "Final states":
 * `verified` requires quoteFound AND support = 'supports' — not just a quote match.
 * Module 03's own `support-judge` agent (T2) isn't built yet, so nothing it produces
 * today can satisfy `support: 'supports'`; everything that passes the deterministic
 * checks instead carries `support: 'unknown'`, which per the architecture doc belongs
 * "available only in the evidence drawer marked 'not confirmed'", never in a main
 * view — this refine is what makes that distinction enforceable at the type level
 * once a view module tries to accept `VerifiedClaim[]` only.
 */
export const VerifiedClaimSchema = ClaimSchema.refine(
  (claim) => claim.verification.quoteFound && claim.verification.support === 'supports',
  { message: "A VerifiedClaim must have verification.quoteFound = true and verification.support = 'supports'" },
);
export type VerifiedClaim = z.infer<typeof VerifiedClaimSchema>;
