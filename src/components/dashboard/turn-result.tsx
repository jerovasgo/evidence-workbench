import { RunResult } from '@/components/run-result';
import { InitialResearchStatus } from '@/components/initial-research-status';
import type { Turn, TurnMemorySnapshot } from '@/lib/use-conversations';
import { useCallback } from 'react';

// 2026-10-28 conversational-flow brief: one turn's own assistant response, in every
// state it can be in before a real run exists — sending (the POST hasn't resolved
// with a runId yet, typically sub-second), errored (the POST itself failed — the
// question stays visible, never dropped, so the user can retry it), or ready (hand
// off to RunResult, which owns everything from there: its own streaming phase,
// using the same processing message so it doesn't flicker on the runId handoff).

export function TurnResult({ turn, onRetry, onMemoryUpdate }: { turn: Turn; onRetry: (turnId: string) => void; onMemoryUpdate: (turnId: string, snapshot: TurnMemorySnapshot) => void }) {
  const updateMemory = useCallback((snapshot: TurnMemorySnapshot) => onMemoryUpdate(turn.id, snapshot), [onMemoryUpdate, turn.id]);
  if (turn.status === 'answered') return <p className="text-sm leading-7">{turn.answer}</p>;
  if (turn.status === 'clarifying') return <p className="text-sm leading-7">{turn.clarification}</p>;
  if (turn.status === 'error') {
    return (
      <div role="alert" className="flex flex-col gap-3 rounded-[var(--radius-card)] border border-conflict/40 bg-black/40 p-4 text-sm text-conflict">
        <p>{turn.errorMessage ?? 'Something went wrong.'}</p>
        <button
          type="button"
          onClick={() => onRetry(turn.id)}
          className="self-start rounded-[var(--radius-pill)] border border-border-strong px-3 py-1.5 text-xs text-fg transition-colors hover:border-fg"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!turn.runId) {
    return <InitialResearchStatus query={turn.freeText} mode={turn.mode} />;
  }

  return <RunResult runId={turn.runId} mode={turn.mode} intent={turn.intent} query={turn.freeText} onMemoryUpdate={updateMemory} />;
}
