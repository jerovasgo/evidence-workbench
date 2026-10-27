import { z } from 'zod';

// Zod contracts for the module 02 retrieval tools' inputs/outputs (module 10: "tool
// arguments are validated (zod)"). Kept here, not in src/lib/tools, per CLAUDE.md's
// "schemas first" rule — one place for every zod schema in the project.

export const PubmedSearchInputSchema = z.object({
  query: z.string(),
  retmax: z.number().int().positive().optional(),
});
export const PubmedSearchOutputSchema = z.object({ pmids: z.array(z.string()) });

export const PubmedSummarySchema = z.object({
  pmid: z.string(),
  title: z.string(),
  journal: z.string().optional(),
  pubDate: z.string().optional(),
  pubTypes: z.array(z.string()),
  doi: z.string().optional(),
});
export const PubmedFetchInputSchema = z.object({ pmids: z.array(z.string()) });
export const PubmedFetchOutputSchema = z.object({ summaries: z.array(PubmedSummarySchema) });

export const EuropePmcResultItemSchema = z.object({
  id: z.string(),
  source: z.string(),
  pmid: z.string().optional(),
  doi: z.string().optional(),
  title: z.string(),
  authorString: z.string().optional(),
  pubYear: z.number().int().optional(),
  isOpenAccess: z.boolean(),
  pubTypes: z.array(z.string()),
});
export const EuropePmcSearchInputSchema = z.object({
  query: z.string(),
  pageSize: z.number().int().positive().optional(),
});
export const EuropePmcSearchOutputSchema = z.object({ results: z.array(EuropePmcResultItemSchema) });

export const EuropePmcFullTextInputSchema = z.object({ source: z.string(), id: z.string() });
export const EuropePmcFullTextOutputSchema = z.object({ text: z.string().nullable() });

export const CrossrefUpdateNoticeSchema = z.object({
  type: z.string(),
  doi: z.string(),
  updated: z.string().optional(),
});
export const CrossrefWorkSchema = z.object({
  doi: z.string(),
  title: z.string().optional(),
  issued: z.string().optional(),
  retracted: z.boolean(),
  updateNotices: z.array(CrossrefUpdateNoticeSchema),
});
export const CrossrefLookupInputSchema = z.object({ doi: z.string() });
export const CrossrefLookupOutputSchema = z.object({ work: CrossrefWorkSchema.nullable() });

export const FetchUrlTextInputSchema = z.object({ url: z.string().url() });
export const FetchUrlTextOutputSchema = z.object({
  finalUrl: z.string(),
  status: z.number().int(),
  contentType: z.string(),
  text: z.string(),
  truncated: z.boolean(),
});
