'use client';

import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { Info } from 'lucide-react';
import { cn } from '@/lib/cn';
import type { AgentActivity, StageName, StageState } from '@/lib/use-run-stream';
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

const ACTIVITY_GROUPS = [
  { key: 'planning', label: 'Question & search planning', matches: ['scenario-structurer', 'search-planner'] },
  { key: 'sources', label: 'Source review', matches: ['web-source-finder', 'source-classifier'] },
  { key: 'extraction', label: 'Evidence extraction', matches: ['claim-extractor'] },
  { key: 'verification', label: 'Claim verification', matches: ['support-judge'] },
  { key: 'synthesis', label: 'Answer & visual synthesis', matches: ['retrieved-overview', 'evidence-overview', 'algorithm-synthesizer', 'mechanism-synthesizer', 'relation-labeller'] },
] as const;

function summarizeAgentActivities(activities: AgentActivity[]) {
  return ACTIVITY_GROUPS.flatMap((group) => {
    const items = activities.filter((item) => group.matches.some((name) => item.name === name));
    if (!items.length) return [];
    const status = items.some((item) => item.status === 'running')
      ? 'running'
      : items.some((item) => item.status === 'completed')
        ? 'completed'
        : items.some((item) => item.status === 'failed')
          ? 'failed'
          : 'abstained';
    return [{
      key: group.key,
      label: group.label,
      agents: [...new Set(items.map((item) => item.name.replaceAll('-', ' ')))],
      provider: items[0]!.provider,
      model: items[0]!.model,
      status,
      ms: items.reduce((sum, item) => sum + (item.ms ?? 0), 0),
      tokens: items.reduce((sum, item) => sum + (item.tokens ?? 0), 0),
    }];
  });
}

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
  agentActivities,
  sourceCatalog,
  isStreaming,
}: {
  stages: Record<StageName, StageState>;
  sourceProgress: string[];
  agentActivities: AgentActivity[];
  sourceCatalog: Record<string, { title: string }>;
  isStreaming: boolean;
}) {
  const reducedMotion = useReducedMotion();
  const activity = currentActivityMessage(stages, sourceProgress, sourceCatalog);
  const summarizedActivities = summarizeAgentActivities(agentActivities);

  return (
    <details className="glass rounded-[var(--radius-card)] p-4">
      <summary className="cursor-pointer select-none text-sm text-fg">
        <span className="inline-flex max-w-[calc(100%-1rem)] items-center gap-2 align-middle">
          <span className="inline-flex shrink-0 items-center gap-1.5">Agent activity <Info className="size-3.5 text-muted" aria-hidden="true" /></span>
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
      <div className="mt-4 rounded-[var(--radius-chip)] border border-border bg-black/35 p-3" aria-label="Meta model activity">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-medium text-fg">Meta model activity</p>
            <p className="mt-0.5 text-[11px] text-muted">Live telemetry emitted by the server for this response.</p>
          </div>
          {summarizedActivities.some((item) => item.status === 'running') && <span className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[0.12em] text-muted"><span className="size-1.5 animate-pulse rounded-full bg-fg" />Live</span>}
        </div>
        {summarizedActivities.length > 0 ? (
          <ul className="mt-3 space-y-2">
            {summarizedActivities.map((item) => (
              <li key={item.key} className="grid gap-1 border-t border-border pt-2 first:border-0 first:pt-0 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:gap-3">
                <div className="min-w-0">
                  <p className="truncate text-xs text-fg">{item.label}</p>
                  <p className="truncate text-[11px] text-muted">{item.provider} · {item.model} · {item.agents.join(', ')}</p>
                </div>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted">
                  <span className={cn(item.status === 'running' && 'text-fg', item.status === 'failed' && 'text-conflict')}>{item.status}</span>
                  {item.ms > 0 && <span>{(item.ms / 1000).toFixed(1)} s</span>}
                  {item.tokens > 0 && <span>{item.tokens.toLocaleString()} tokens</span>}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-xs text-muted">No live Meta model call has been emitted for this playback.</p>
        )}
      </div>
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
