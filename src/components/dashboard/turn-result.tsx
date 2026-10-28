import { RunResult } from '@/components/run-result';
import { EvidenceSkeleton } from '@/components/evidence-skeleton';
import { initialProcessingMessage } from '@/lib/processing-messages';
import type { Turn } from '@/lib/use-conversations';

// 2026-10-28 conversational-flow brief: one turn's own assistant response, in every
// state it can be in before a real run exists — sending (the POST hasn't resolved
// with a runId yet, typically sub-second), errored (the POST itself failed — the
// question stays visible, never dropped, so the user can retry it), or ready (hand
// off to RunResult, which owns everything from there: its own streaming phase,
// using the same processing message so it doesn't flicker on the runId handoff).

export function TurnResult({ turn, onRetry }: { turn: Turn; onRetry: (turnId: string) => void }) {
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
    return (
      <div className="flex flex-col gap-4">
        <p className="text-sm text-fg">{initialProcessingMessage(turn.mode)}</p>
        <EvidenceSkeleton />
      </div>
    );
  }

  return <RunResult runId={turn.runId} mode={turn.mode} intent={turn.intent} />;
}
