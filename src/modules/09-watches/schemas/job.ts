import { z } from 'zod';

export const JobSpecSchema = z.object({
  id: z.string(),
  name: z.string(),
  topic: z.object({
    condition: z.string(),
    subquestions: z.array(z.string()).optional(),
  }),
  sources: z.object({
    standardsBodies: z.boolean(),
    pubmed: z.boolean(),
    web: z.boolean(),
    localPool: z.boolean(),
  }),
  analysis: z.array(
    z.enum(['detect_changes', 'grade_new_evidence', 'compare_sources', 'flag_inconsistencies']),
  ),
  schedule: z.object({
    cron: z.string(),
    timezone: z.string(),
  }),
  delivery: z.object({
    channel: z.literal('in_app'),
    detail: z.enum(['brief', 'standard', 'detailed']),
  }),
  limits: z.object({
    maxCostUsdPerRun: z.number().positive(),
    maxRunsPerDay: z.number().int().positive(),
  }),
  status: z.enum(['active', 'paused']),
});
export type JobSpec = z.infer<typeof JobSpecSchema>;
