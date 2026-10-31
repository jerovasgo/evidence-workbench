import { z } from 'zod';
const Selection = z.object({ sourceId: z.string(), rank: z.number(), reason: z.string(), decision: z.string() });
const Review = z.object({ sourceId: z.string(), status: z.string(), reason: z.string() });
const Section = z.object({ passageId: z.string(), locator: z.string(), section: z.string(), status: z.enum(['pending', 'reviewed', 'unreviewed']), reason: z.string() });
export const ReviewAuditSchema = z.object({ selection: z.array(Selection), sources: z.array(Review), sections: z.array(z.object({ sourceId: z.string(), passages: z.array(Section) })) });
export type ReviewAudit = z.infer<typeof ReviewAuditSchema>;
export function buildReviewAudit(stages: Map<string, { value?: unknown }>): ReviewAudit {
  const selection = z.array(Selection).safeParse(stages.get('source_selection')?.value);
  const sources = z.array(Review).safeParse(stages.get('source_review_status')?.value);
  const sections: ReviewAudit['sections'] = [];
  for (const [key, record] of stages) {
    if (!key.startsWith('sections:')) continue;
    const parsed = z.array(Section).safeParse(record.value);
    if (parsed.success) sections.push({ sourceId: key.slice(9), passages: parsed.data });
  }
  return { selection: selection.success ? selection.data : [], sources: sources.success ? sources.data : [], sections };
}
