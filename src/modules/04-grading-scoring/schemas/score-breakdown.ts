import { z } from 'zod';

// SPEC §8: "ScoreBreakdown = { relevance, level, quality, currency, applicability,
// total }". `applicabilityLabel` is a UI-convenience addition beyond that literal
// 6-field sketch — the category ('match'|'partial'|'mismatch') the numeric
// `applicability` weight came from, so the drawer can show "Applicability: 1.0
// (setting match)" without re-deriving the label from the raw number.

export const ScoreBreakdownSchema = z.object({
  relevance: z.number().min(0).max(1),
  level: z.number().min(0).max(1),
  quality: z.number().min(0).max(1),
  currency: z.number().min(0).max(1),
  applicability: z.number().min(0).max(1),
  total: z.number().min(0).max(1),
  applicabilityLabel: z.enum(['match', 'partial', 'mismatch']),
});
export type ScoreBreakdown = z.infer<typeof ScoreBreakdownSchema>;
