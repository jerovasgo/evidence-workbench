import { z } from 'zod';

export const DivergenceSchema = z.object({
  kind: z.enum(['outdated', 'legitimate_adaptation', 'scientific_contradiction']),
  requiresExpertReview: z.boolean(),
  suggested: z.enum(['local', 'external', 'none']),
  rationale: z.array(z.string()),
});
export type Divergence = z.infer<typeof DivergenceSchema>;

export const RelationSchema = z.object({
  from: z.string(),
  to: z.string(),
  kind: z.enum(['agrees', 'differs', 'supersedes', 'contradicts', 'adapts']),
  evidence: z.string(),
  divergence: DivergenceSchema.optional(),
});
export type Relation = z.infer<typeof RelationSchema>;
