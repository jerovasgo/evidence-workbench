import { z } from 'zod';

export const SourceKindSchema = z.enum([
  'guideline',
  'systematic_review',
  'rct',
  'observational',
  'local_protocol',
  'pathway_db',
  'other',
]);
export type SourceKind = z.infer<typeof SourceKindSchema>;

export const SourceSchema = z.object({
  id: z.string(),
  kind: SourceKindSchema,
  title: z.string(),
  issuer: z.string().optional(),
  year: z.number().int().optional(),
  version: z.string().optional(),
  pmid: z.string().optional(),
  doi: z.string().optional(),
  url: z.string().url(),
  accessedAt: z.string().datetime(),
  contentHash: z.string(),
  supersededBy: z.string().optional(),
  retracted: z.boolean().optional(),
  appliesTo: z
    .object({
      country: z.string().optional(),
      setting: z.string().optional(),
      population: z.string().optional(),
    })
    .optional(),
  nativeGradingSystem: z.string().optional(),
});
export type Source = z.infer<typeof SourceSchema>;

export const PassageSchema = z.object({
  id: z.string(),
  sourceId: z.string(),
  locator: z.string(),
  text: z.string(),
});
export type Passage = z.infer<typeof PassageSchema>;
