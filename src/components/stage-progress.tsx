'use client';

import { useState } from 'react';
import { cn } from '@/lib/cn';
import type { StageName, StageState } from '@/lib/use-run-stream';
import { narrateStageResult, narrateSourceProgress } from '@/lib/i18n/stage-narration';

// 2026-10-28 conversational-flow brief, Etapa C: "Agent activity"-style collapsed
// panel showing a brief description of the active stage, expandable for detail.
// Collapsed by default via a native <details> (no JS state, keyboard-accessible for
// free); the stage list and statuses are the same real SSE-driven data as before —
// nothing here is simulated or percentage-based.
// 2026-11-02: narrated via stage-narration.ts instead of raw stage/status labels and
// raw per-source log lines, and flattened to one <details> instead of two nested ones
// — same data, read as a chain-of-thought instead of a technical log.

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

export function StageProgress({
  stages,
  sourceProgress,
  sourceCatalog,
  isStreaming,
}: {
  stages: Record<StageName, StageState>;
  sourceProgress: string[];
  sourceCatalog: Record<string, { title: string }>;
  isStreaming: boolean;
}) {
  // Captured once: a run that's still streaming opens expanded by default, but a
  // reader who manually collapses it while it's running stays in control — this
  // never re-forces it open on a later render.
  const [defaultOpen] = useState(isStreaming);

  return (
    <details className="glass rounded-[var(--radius-card)] p-4" open={defaultOpen}>
      <summary className="cursor-pointer select-none text-sm text-fg">
        Agent activity <span className="text-muted">{'—'} {currentStageSummary(stages)}</span>
      </summary>
      <ol className="mt-3 flex flex-col gap-2">
        {STAGE_ORDER.map((stage) => {
          const state = stages[stage];
          return (
            <li key={stage} className="flex items-center gap-3 text-sm">
              <span className={cn('h-2 w-2 flex-shrink-0 rounded-full', STATUS_DOT[state.status])} aria-hidden="true" />
              <span className="text-fg">{state.status === 'pending' ? STAGE_LABEL[stage] : narrateStageResult(stage, state.status)}</span>
            </li>
          );
        })}
      </ol>
      {sourceProgress.length > 0 && (
        <ul className="mt-3 flex flex-col gap-1 text-xs text-muted">
          {sourceProgress.map((line, i) => (
            <li key={i} className="truncate">
              {narrateSourceProgress(line, sourceCatalog)}
            </li>
          ))}
        </ul>
      )}
    </details>
  );
}
