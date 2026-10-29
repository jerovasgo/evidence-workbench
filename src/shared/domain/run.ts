import { z } from 'zod';
import { RelationSchema } from './relation';

export const ReceiptSchema = z.object({
  claimsTotal: z.number().int().nonnegative(),
  citationsExist: z.number().int().nonnegative(),
  quotesFound: z.number().int().nonnegative(),
  retracted: z.number().int().nonnegative(),
  supported: z.number().int().nonnegative(),
  abstained: z.number().int().nonnegative(),
  sourcesByKind: z.record(z.string(), z.number().int().nonnegative()),
  oldestSourceYear: z.number().int().optional(),
  generatedAt: z.string().datetime(),
});
export type Receipt = z.infer<typeof ReceiptSchema>;

export const RunStageSchema = z.object({
  name: z.string(),
  ms: z.number().nonnegative(),
  model: z.string().optional(),
  ok: z.boolean(),
});
export type RunStage = z.infer<typeof RunStageSchema>;

export const RunSchema = z.object({
  id: z.string(),
  intent: z.string(),
  stages: z.array(RunStageSchema),
  receipt: ReceiptSchema,
  costUsd: z.number().nonnegative(),
  promptVersions: z.record(z.string(), z.string()),
});
export type Run = z.infer<typeof RunSchema>;

/**
 * Discriminated union of SSE event types (module 01). Shared between server and client
 * so the UI reducer is type-checked against the stream.
 */
export const RunEventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('stage_started'), runId: z.string(), stage: z.string() }),
  z.object({
    type: z.literal('stage_progress'),
    runId: z.string(),
    stage: z.string(),
    detail: z.string().optional(),
  }),
  z.object({ type: z.literal('band_ready'), runId: z.string(), payload: z.unknown() }),
  z.object({ type: z.literal('node_verified'), runId: z.string(), nodeId: z.string() }),
  z.object({ type: z.literal('view_ready'), runId: z.string(), view: z.string() }),
  z.object({ type: z.literal('relations_ready'), runId: z.string(), questions: z.array(z.string()), relations: z.array(RelationSchema), status: z.enum(['ok', 'partial', 'failed']) }),
  z.object({ type: z.literal('receipt_ready'), runId: z.string(), receipt: ReceiptSchema }),
  z.object({ type: z.literal('error'), runId: z.string(), message: z.string() }),
  z.object({ type: z.literal('done'), runId: z.string(), status: z.enum(['done', 'partial', 'abstained', 'failed']) }),
]);
export type RunEvent = z.infer<typeof RunEventSchema>;

/** Per-stage envelope used internally between pipeline stages (module 00/01). */
export const StageResultSchema = <T extends z.ZodTypeAny>(valueSchema: T) =>
  z.object({
    stage: z.string(),
    status: z.enum(['ok', 'partial', 'abstain', 'failed']),
    value: valueSchema.optional(),
    reasons: z.array(z.string()).optional(),
    metrics: z.object({
      ms: z.number().nonnegative(),
      costUsd: z.number().nonnegative(),
      counts: z.record(z.string(), z.number()).optional(),
    }),
  });
