 'use client';
import { useEffect, useState } from 'react';
import { ReviewAuditSchema, type ReviewAudit } from '@/lib/review-audit';
export function ReviewAuditPanel({ runId, complete, sources }: { runId: string; complete: boolean; sources: Record<string, { title: string }> }) {
  const [audit, setAudit] = useState<ReviewAudit | null>(null);
  const [error, setError] = useState(false);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setError(false);
    void fetch(`/api/runs/${runId}?audit=1`, { signal: controller.signal }).then(async (response) => {
      if (!response.ok) throw new Error('Unavailable');
      const body = await response.json();
      const result = ReviewAuditSchema.parse(body.audit);
      if (!controller.signal.aborted) setAudit(result);
    }).catch(() => { if (!controller.signal.aborted) setError(true); });
    return () => controller.abort();
  }, [runId, complete, revision]);
  return <section className="research-surface rounded-2xl p-5 space-y-4" aria-label="Review coverage">
    <h3 className="text-sm font-medium">Selection and review coverage</h3>
    <p className="text-xs leading-5 text-muted">Reviewed means extraction completed, not that every statement was verified. Low title relevance changes priority; it does not exclude a source.</p>
    {!complete && <p className="text-xs text-muted">Research is ongoing. Coverage is a saved snapshot.</p>}
    <button type="button" onClick={() => setRevision((value) => value + 1)} className="text-xs underline underline-offset-4">Refresh coverage</button>
    {error ? <p role="alert" className="text-sm">The saved audit could not be loaded. Refresh to retry.</p> : !audit ? <p role="status" className="text-sm">Loading saved coverage…</p> : <>
      {!audit.selection.length && !audit.sections.length && <p className="text-sm text-muted">No review audit has been saved for this run yet.</p>}
      {audit.selection.map((entry) => <details key={entry.sourceId} className="border-t border-border pt-3">
        <summary className="cursor-pointer text-sm">{entry.rank + 1}. {sources[entry.sourceId]?.title ?? entry.sourceId}</summary>
        <p className="mt-2 text-xs text-muted">Priority: {entry.reason}</p>
        <p className="mt-2 text-xs">Source processing: {audit.sources.find((source) => source.sourceId === entry.sourceId)?.status ?? 'No completion record yet'}</p>
        <ul className="mt-3 space-y-2">{audit.sections.find((section) => section.sourceId === entry.sourceId)?.passages.map((passage) => <li key={passage.passageId} className="text-xs leading-5"><span className="text-fg">{passage.section} · {passage.locator} · {passage.status}</span><span className="block text-muted">{passage.reason}</span></li>)}</ul>
      </details>)}
    </>}
  </section>;
}
