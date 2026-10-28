'use client';

import { cn } from '@/lib/cn';
import type { StageName, StageState } from '@/lib/use-run-stream';

const STAGE_LABEL: Record<StageName, string> = {
  structure: 'Structure',
  plan: 'Plan search',
  retrieve: 'Retrieve',
  classify: 'Classify sources',
  extract: 'Extract & verify',
};

const STATUS_DOT: Record<StageState['status'], string> = {
  pending: 'bg-border',
  running: 'bg-accent animate-pulse',
  ok: 'bg-accent',
  partial: 'bg-warning',
  abstain: 'bg-muted',
  failed: 'bg-conflict',
};

export function StageProgress({ stages, sourceProgress }: { stages: Record<StageName, StageState>; sourceProgress: string[] }) {
  const order: StageName[] = ['structure', 'plan', 'retrieve', 'classify', 'extract'];

  return (
    <div className="rounded-[var(--radius-card)] border border-border bg-surface p-4">
      <ol className="flex flex-col gap-2">
        {order.map((stage) => {
          const state = stages[stage];
          return (
            <li key={stage} className="flex items-center gap-3 text-sm">
              <span className={cn('h-2 w-2 flex-shrink-0 rounded-full', STATUS_DOT[state.status])} aria-hidden="true" />
              <span className="text-fg">{STAGE_LABEL[stage]}</span>
              <span className="text-xs text-muted">{state.status !== 'pending' ? state.status : ''}</span>
            </li>
          );
        })}
      </ol>
      {sourceProgress.length > 0 && (
        <details className="mt-3 text-xs text-muted">
          <summary className="cursor-pointer select-none">{sourceProgress.length} source(s) processed</summary>
          <ul className="mt-2 flex flex-col gap-1 font-mono">
            {sourceProgress.map((line, i) => (
              <li key={i} className="truncate">
                {line}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
