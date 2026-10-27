import { z } from 'zod';
import { ConditionSchema } from './claim.js';

export const AlgorithmNodeSchema = z.object({
  id: z.string(),
  type: z.enum([
    'red_flag',
    'assess',
    'test',
    'decision',
    'action',
    'disposition',
    'reassess',
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
