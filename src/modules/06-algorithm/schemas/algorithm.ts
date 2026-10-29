import { z } from 'zod';
import { ConditionSchema } from '@/shared/domain';

// 2026-10-29 pivot (docs/DECISIONS.md): node-type vocabulary generalized from a
// clinical-triage workflow to any verified decision pathway. `red_flag` ->
// `critical_check` (a safety/critical constraint checked first, e.g. "is the
// reagent air-sensitive?"); `test` -> `method` (perform an analytical/experimental
// method); `disposition` -> `outcome` (the pathway's terminal result/conclusion);
// `reassess` -> `iterate` (loop back and re-evaluate). Same 8-node shape, same
// invariants (renamed in validators/algorithm.ts).
export const AlgorithmNodeSchema = z.object({
  id: z.string(),
  type: z.enum([
    'critical_check',
    'assess',
    'method',
    'decision',
    'action',
    'outcome',
    'iterate',
    'abstain',
  ]),
  label: z.string(),
  detail: z.string().optional(),
  urgency: z.enum(['immediate', 'minutes', 'hours']).optional(),
  claimIds: z.array(z.string()),
  provenance: z.enum(['local', 'external', 'both', 'conflict']),
});
export type AlgorithmNode = z.infer<typeof AlgorithmNodeSchema>;

export const AlgorithmEdgeSchema = z.object({
  from: z.string(),
  to: z.string(),
  condition: ConditionSchema,
});
export type AlgorithmEdge = z.infer<typeof AlgorithmEdgeSchema>;

export const AlgorithmGraphSchema = z.object({
  nodes: z.array(AlgorithmNodeSchema),
  edges: z.array(AlgorithmEdgeSchema),
});
export type AlgorithmGraph = z.infer<typeof AlgorithmGraphSchema>;
