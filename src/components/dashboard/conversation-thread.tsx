import { TurnResult } from '@/components/dashboard/turn-result';
import type { Turn } from '@/lib/use-conversations';

// "Each response can contain a brief synthesis, the main visualization, references,
// and contextual controls... visualizations must not be compressed into chat
// bubbles." Each turn renders as a full-width surface, not a narrow bubble.

export function ConversationThread({ turns, onRetryTurn }: { turns: Turn[]; onRetryTurn: (turnId: string) => void }) {
  return (
    // pt-16 clears the fixed mobile hamburger trigger (Sidebar, top-4 + h-9); not
    // needed at md: and up, where the sidebar sits inline instead of floating.
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-12 px-6 pb-8 pt-16 md:pt-8">
      {turns.map((turn) => (
        <article key={turn.id} className="flex flex-col gap-6">
          <p className="text-lg font-medium text-fg">{turn.freeText}</p>
          <TurnResult turn={turn} onRetry={onRetryTurn} />
        </article>
      ))}
    </div>
  );
}
