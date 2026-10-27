import { z } from 'zod';

// Module 01 `router` agent (P1) output contract — the authoritative intent set and
// shape. The P1 draft in docs/PROMPTS.md predates this and uses a different,
// narrower set; docs/architecture/00-overview.md says the architecture files win.

export const IntentSchema = z.enum([
  'algorithm',
  'evidence_map',
  'mechanism',
  'fact_lookup',
  'comparison',
  'watch',
  'out_of_scope',
]);
export type Intent = z.infer<typeof IntentSchema>;

export const RouterOutputSchema = z.object({
  intent: IntentSchema,
  secondary: IntentSchema.optional(),
  condition: z.string().optional(),
  setting: z.string().optional(),
  confidence: z.enum(['high', 'medium', 'low']),
  reject: z.object({ reason: z.string() }).optional(),
});
export type RouterOutput = z.infer<typeof RouterOutputSchema>;
