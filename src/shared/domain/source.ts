import { z } from 'zod';

// 2026-10-29 pivot (docs/DECISIONS.md): clinical evidence-design categories
// (guideline/RCT/local_protocol/pathway_db) replaced with a general-science
// source hierarchy. `meta_analysis` and `preprint` are genuinely new tiers —
// general-science literature foregrounds both much more than clinical guidelines
// do. `local_protocol` is kept as-is: a lab's own internal SOP vs. published
// literature is a real, field-general governance need (module 05), not clinical.
export const SourceKindSchema = z.enum([
  'meta_analysis',
  'systematic_review',
  'controlled_experiment',
  'observational_study',
  'preprint',
  'reference_work',
  'standards_body',
  'dataset_or_database',
  'local_protocol',
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
      // 2026-10-29 pivot: "population" (patient population) -> "scope" — what the
      // finding applies to in general-science terms (an organism, a material, a
      // reaction system).
      scope: z.string().optional(),
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
