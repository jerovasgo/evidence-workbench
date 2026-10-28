import { z } from 'zod';
import { ConditionSchema, SupportIssueSchema } from '@/shared/domain';

// Module 03 `support-judge` agent (P10, T2) — the 8th and final deterministic-vs-
// model verification step (docs/architecture/03-claim-extraction-and-verification.md):
// "judge only against the supplied text; say unknown rather than guess; check
// specifically for scope drift (population, setting, comparator), negation and
// strength mismatch." This is the step that lets a claim ever reach
// `verification.support: 'supports'` — nothing before this stage can.

export const JudgeSupportInputSchema = z.object({
  claimText: z.string().min(1),
  conditions: z.array(ConditionSchema),
  quote: z.string().min(1),
  /** +/-800 chars around the quote, located by code (src/modules/03-extraction-verification/pipeline/support-context.ts). */
  surroundingContext: z.string().min(1),
});
export type JudgeSupportInput = z.infer<typeof JudgeSupportInputSchema>;

export const JudgeSupportOutputSchema = z.object({
  support: z.enum(['supports', 'partial', 'no', 'unknown']),
  issues: z.array(SupportIssueSchema),
  note: z.string(),
});
export type JudgeSupportOutput = z.infer<typeof JudgeSupportOutputSchema>;
