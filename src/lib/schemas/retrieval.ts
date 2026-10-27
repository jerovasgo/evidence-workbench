import { z } from 'zod';
import { SourceKindSchema } from './source';

// Module 02 contracts: SearchPlan, CandidateSource, CoverageReport.

export const SourceFamilySchema = z.enum(['guideline', 'pubmed', 'europe_pmc', 'web', 'local']);
export type SourceFamily = z.infer<typeof SourceFamilySchema>;

export const SearchQuerySchema = z.object({
  family: SourceFamilySchema,
  text: z.string(),
  filters: z.record(z.string(), z.string()).optional(),
  purpose: z.string(),
});
export type SearchQuery = z.infer<typeof SearchQuerySchema>;

export const SearchPlanSchema = z.object({
  queries: z.array(SearchQuerySchema).max(12),
  mustFind: z.array(z.string()).optional(),
});
export type SearchPlan = z.infer<typeof SearchPlanSchema>;

/**
 * A source before curation: may still be a duplicate, superseded, or retracted.
 * `relevance`/`quality` are model-supplied features (0-1); code multiplies them with
 * the level/currency/applicability weights it computes itself (SPEC §8 scoring rule).
 */
export const CandidateSourceSchema = z.object({
  tempId: z.string(),
  family: SourceFamilySchema,
  kind: SourceKindSchema.optional(),
  title: z.string(),
  issuer: z.string().optional(),
  firstAuthor: z.string().optional(),
  year: z.number().int().optional(),
  doi: z.string().optional(),
  pmid: z.string().optional(),
  url: z.string().url(),
  snippet: z.string().optional(),
  isScientific: z.boolean().optional(),
  isSuperseded: z.boolean().optional(),
  retracted: z.boolean().optional(),
  isOpenAccess: z.boolean().optional(),
  relevance: z.number().min(0).max(1).optional(),
  quality: z.number().min(0).max(1).optional(),
});
export type CandidateSource = z.infer<typeof CandidateSourceSchema>;

export const CoverageEntrySchema = z.object({
  subQuestion: z.string(),
  sourcesFound: z.number().int().nonnegative(),
  bestLevel: SourceKindSchema.nullable(),
  oldestYear: z.number().int().optional(),
  thin: z.boolean(),
});
export type CoverageEntry = z.infer<typeof CoverageEntrySchema>;

export const CoverageReportSchema = z.object({
  entries: z.array(CoverageEntrySchema),
});
export type CoverageReport = z.infer<typeof CoverageReportSchema>;
