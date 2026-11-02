import { z } from 'zod';

// 2026-11-02 (docs/DECISIONS.md): the Main Answer's overview used to be strictly
// one short paragraph, no structure. The model may now add further sections when
// — and only when — the evidence genuinely supports more than the lead paragraph
// (never a rigid template); every section stays grounded via `claimIds`, the same
// contract the top-level answer already uses.

export const OverviewSectionSchema = z.object({
  heading: z.string().min(1).max(60),
  body: z.string().min(1).max(900),
  claimIds: z.array(z.string()).min(1),
});
export type OverviewSection = z.infer<typeof OverviewSectionSchema>;

export const EvidenceOverviewOutputSchema = z.object({
  text: z.string().min(1).max(1500),
  sections: z.array(OverviewSectionSchema).max(5).optional(),
  claimIds: z.array(z.string()).min(1),
});
export type EvidenceOverviewOutput = z.infer<typeof EvidenceOverviewOutputSchema>;

/** What `synthesizeEvidenceOverview` hands back once validated against the real claim pool. */
export interface EvidenceOverviewResult {
  text: string;
  sections: OverviewSection[];
}
