import { z } from 'zod';
import { SourceKindSchema } from '@/shared/domain';

// Module 02 `source-classifier` agent (P4) contracts.

export const SourceToClassifySchema = z.object({
  sourceId: z.string(),
  title: z.string(),
  /** First ~1,500 chars of metadata/abstract/body text (module 02). */
  metadataAndText: z.string(),
});
export type SourceToClassify = z.infer<typeof SourceToClassifySchema>;

export const ClassifySourcesInputSchema = z.object({
  sources: z.array(SourceToClassifySchema).max(40),
});
export type ClassifySourcesInput = z.infer<typeof ClassifySourcesInputSchema>;

export const SourceClassificationSchema = z.object({
  sourceId: z.string(),
  kind: SourceKindSchema,
  isScientific: z.boolean(),
  issuer: z.string().optional(),
  publicationYear: z.number().int().optional(),
  version: z.string().optional(),
  hasExplicitMethods: z.boolean().optional(),
  nativeGradingSystem: z.string().optional(),
  declaresConflictsOfInterest: z.boolean().optional(),
  appliesTo: z
    .object({
      country: z.string().optional(),
      setting: z.string().optional(),
      population: z.string().optional(),
    })
    .optional(),
  supersedesOrSupersededBy: z.string().optional(),
  confidence: z.enum(['high', 'medium', 'low']),
});
export type SourceClassification = z.infer<typeof SourceClassificationSchema>;

export const ClassifySourcesOutputSchema = z.object({
  classifications: z.array(SourceClassificationSchema),
});
export type ClassifySourcesOutput = z.infer<typeof ClassifySourcesOutputSchema>;
