'use client';

import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
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

export function currentActivityMessage(
  stages: Record<StageName, StageState>,
  sourceProgress: string[],
  sourceCatalog: Record<string, { title: string }>,
): string {
  const latestSourceEvent = sourceProgress.at(-1);
  if (latestSourceEvent && stages.extract.status === 'running') {
    return narrateSourceProgress(latestSourceEvent, sourceCatalog);
  }
  const running = STAGE_ORDER.find((stage) => stages[stage].status === 'running');
  if (running) return narrateStageResult(running, 'running');
  const lastActive = [...STAGE_ORDER].reverse().find((stage) => stages[stage].status !== 'pending');
  return lastActive ? narrateStageResult(lastActive, stages[lastActive].status) : 'Preparing the research workflow…';
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
  const reducedMotion = useReducedMotion();
  const activity = currentActivityMessage(stages, sourceProgress, sourceCatalog);

  return (
    <details className="glass rounded-[var(--radius-card)] p-4">
      <summary className="cursor-pointer select-none text-sm text-fg">
        <span className="inline-flex max-w-[calc(100%-1rem)] items-center gap-2 align-middle">
          <span className="shrink-0">Agent activity</span>
          <span aria-hidden="true" className="text-muted">—</span>
          <span className="relative block h-5 min-w-0 flex-1 overflow-hidden text-muted" aria-live="polite" aria-atomic="true">
            <AnimatePresence initial={false} mode="wait">
              <motion.span
                key={activity}
                className="absolute inset-0 truncate"
                initial={reducedMotion ? false : { opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reducedMotion ? undefined : { opacity: 0, y: -6 }}
                transition={{ duration: 0.22, ease: 'easeOut' }}
              >
                {activity}
              </motion.span>
            </AnimatePresence>
          </span>
          {isStreaming && <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-fg" aria-hidden="true" />}
        </span>
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
