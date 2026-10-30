'use client';

import { cn } from '@/lib/cn';
import type { StageName, StageState } from '@/lib/use-run-stream';

// 2026-10-28 conversational-flow brief, Etapa C: "Agent activity"-style collapsed
// panel showing a brief description of the active stage, expandable for detail.
// Collapsed by default via a native <details> (no JS state, keyboard-accessible for
// free); the stage list and statuses are the same real SSE-driven data as before —
// nothing here is simulated or percentage-based.

const STAGE_ORDER: StageName[] = ['structure', 'plan', 'retrieve', 'classify', 'extract'];

const STAGE_LABEL: Record<StageName, string> = {
  structure: 'Structure',
  plan: 'Plan search',
  retrieve: 'Retrieve',
  classify: 'Classify sources',
  extract: 'Extract & verify',
};

const STATUS_DOT: Record<StageState['status'], string> = {
  pending: 'bg-border',
  running: 'bg-fg animate-pulse',
  ok: 'bg-fg',
  partial: 'bg-warning',
  abstain: 'bg-muted',
  failed: 'bg-conflict',
};

/** One line for the collapsed summary: the running stage, or the most recently finished one, never a fabricated percentage. */
function currentStageSummary(stages: Record<StageName, StageState>): string {
  const running = STAGE_ORDER.find((s) => stages[s].status === 'running');
  if (running) return `${STAGE_LABEL[running]}…`;

  const lastActive = [...STAGE_ORDER].reverse().find((s) => stages[s].status !== 'pending');
  if (!lastActive) return 'Starting…';
  return `${STAGE_LABEL[lastActive]} ${stages[lastActive].status}`;
}

export function StageProgress({ stages, sourceProgress }: { stages: Record<StageName, StageState>; sourceProgress: string[] }) {
  return (
    <details className="glass rounded-[var(--radius-card)] p-4">
      <summary className="cursor-pointer select-none text-sm text-fg">
        Agent activity <span className="text-muted">{'—'} {currentStageSummary(stages)}</span>
      </summary>
      <ol className="mt-3 flex flex-col gap-2">
        {STAGE_ORDER.map((stage) => {
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
    </details>
  );
}
