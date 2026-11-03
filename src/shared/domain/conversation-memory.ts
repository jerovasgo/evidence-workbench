import { z } from 'zod';

const ConversationIntentSchema = z.enum([
  'algorithm',
  'evidence_map',
  'mechanism',
  'fact_lookup',
  'comparison',
  'watch',
  'out_of_scope',
]);

export const ConversationFindingSchema = z.object({
  id: z.string().min(1).max(200),
  text: z.string().min(1).max(360),
  sourceTitle: z.string().min(1).max(220).optional(),
});

export const ConversationSourceSchema = z.object({
  id: z.string().min(1).max(200),
  title: z.string().min(1).max(220),
  year: z.number().int().min(1600).max(2200).optional(),
});

export const ConversationMemoryTurnSchema = z.object({
  id: z.string().min(1).max(200),
  query: z.string().min(1).max(1500),
  runId: z.string().uuid().nullable().optional(),
  intent: ConversationIntentSchema.nullable().optional(),
  overview: z.string().min(1).max(900).optional(),
  findings: z.array(ConversationFindingSchema).max(4).default([]),
  sources: z.array(ConversationSourceSchema).max(4).default([]),
  visualization: z.object({
    kind: z.enum(['algorithm', 'mechanism', 'evidence_map', 'comparison', 'evidence']),
    summary: z.string().min(1).max(600),
  }).optional(),
  capturedAt: z.number().int().nonnegative(),
});

export const ConversationContextSchema = z.object({
  id: z.string().uuid(),
  turns: z.array(ConversationMemoryTurnSchema).max(3),
});

export type ConversationFinding = z.infer<typeof ConversationFindingSchema>;
export type ConversationSource = z.infer<typeof ConversationSourceSchema>;
export type ConversationMemoryTurn = z.infer<typeof ConversationMemoryTurnSchema>;
export type ConversationContext = z.infer<typeof ConversationContextSchema>;

export const CONVERSATION_MEMORY_TTL_MS = 2 * 60 * 60 * 1000;

/**
 * Keeps the context capsule small and fresh. It intentionally lives in the active
 * browser tab: no localStorage, database row or account is involved.
 */
export function compactConversationContext(
  id: string,
  turns: ConversationMemoryTurn[],
  now = Date.now(),
): ConversationContext {
  const fresh = turns
    .filter((turn) => now - turn.capturedAt < CONVERSATION_MEMORY_TTL_MS)
    .slice(-3)
    .map((turn) => ConversationMemoryTurnSchema.parse({
      ...turn,
      query: turn.query.slice(0, 1500),
      overview: turn.overview?.slice(0, 900),
      findings: turn.findings.slice(0, 4).map((finding) => ({ ...finding, text: finding.text.slice(0, 360), sourceTitle: finding.sourceTitle?.slice(0, 220) })),
      sources: turn.sources.slice(0, 4).map((source) => ({ ...source, title: source.title.slice(0, 220) })),
      visualization: turn.visualization,
    }));
  return ConversationContextSchema.parse({ id, turns: fresh });
}
