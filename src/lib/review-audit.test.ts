import { expect, it } from 'vitest';
import { buildReviewAudit } from './review-audit';
it('preserves unfinished sections and strips document content from audit responses', () => {
 const result = buildReviewAudit(new Map([
  ['source_selection', { value: [{ sourceId: 's', rank: 0, reason: 'Matched hypoxia', decision: 'queued', rawText: 'private text' }] }],
  ['sections:s', { value: [{ passageId: 'p', locator: 'paragraph 4', section: 'discussion', status: 'unreviewed', reason: 'budget', text: 'document content' }] }],
 ]));
 expect(result.sections[0]?.passages[0]?.status).toBe('unreviewed');
 expect(JSON.stringify(result)).not.toContain('document content');
 expect(JSON.stringify(result)).not.toContain('private text');
 expect(result.sources).toEqual([]);
});
it('does not fabricate coverage for missing or invalid saved records', () => {
 expect(buildReviewAudit(new Map([['sections:s', { value: [{ status: 'verified' }] }]]))).toEqual({ selection: [], sources: [], sections: [] });
});
