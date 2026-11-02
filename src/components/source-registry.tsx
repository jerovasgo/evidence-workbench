import { Chip } from '@/components/ui/chip';
import type { SourceRegistryEntry, SourceRegistrySummary } from '@/lib/source-status';

// 2026-11-02 (docs/DECISIONS.md): a clear, honest per-source list with a real
// identified/evaluated/included/excluded summary, replacing the flat, unannotated
// link list this section used to show. Statuses are plain language, never a raw
// internal string (extraction_failed, no_full_text, etc.).

const STATUS_LABEL: Record<SourceRegistryEntry['status'], string> = {
  identified: 'Identified',
  pending_evaluation: 'Pending evaluation',
  evaluated: 'Evaluating…',
  included: 'Included',
  excluded: 'Excluded',
};

const STATUS_TONE: Record<SourceRegistryEntry['status'], 'default' | 'warning' | 'conflict'> = {
  identified: 'default',
  pending_evaluation: 'default',
  evaluated: 'default',
  included: 'default',
  excluded: 'warning',
};

export function SourceRegistrySummaryBar({ summary }: { summary: SourceRegistrySummary }) {
  return (
    <div className="flex flex-wrap gap-3 text-xs text-muted" aria-label="Source selection summary">
      <span>{summary.identified + summary.pendingEvaluation + summary.evaluated + summary.included + summary.excluded} identified</span>
      <span>{summary.included + summary.excluded} evaluated</span>
      <span>{summary.included} included</span>
      <span>{summary.excluded} excluded</span>
    </div>
  );
}

export function SourceRegistryList({ entries }: { entries: SourceRegistryEntry[] }) {
  if (entries.length === 0) return null;
  return (
    <ul className="space-y-2">
      {entries.map((entry) => (
        <li key={entry.id} className="flex flex-col gap-1 border-t border-border pt-2 first:border-t-0 first:pt-0">
          <div className="flex flex-wrap items-center gap-2">
            <a className="text-sm underline underline-offset-4" href={entry.url} target="_blank" rel="noopener noreferrer">{entry.title}</a>
            {entry.year && <span className="text-xs text-muted">({entry.year})</span>}
            <Chip tone={STATUS_TONE[entry.status]}>{STATUS_LABEL[entry.status]}</Chip>
            {entry.claimsExtracted > 0 && <Chip>{entry.claimsExtracted} claim{entry.claimsExtracted === 1 ? '' : 's'}</Chip>}
          </div>
          {entry.reason && <p className="text-xs text-muted">{entry.reason}</p>}
        </li>
      ))}
    </ul>
  );
}
