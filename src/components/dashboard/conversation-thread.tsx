import { TurnResult } from '@/components/dashboard/turn-result';
import type { Turn } from '@/lib/use-conversations';

export function ConversationThread({ turns, onRetryTurn }: { turns: Turn[]; onRetryTurn: (turnId: string) => void }) {
  return (
    // pt-16 clears the fixed mobile hamburger trigger (Sidebar, top-4 + h-9); not
    // needed at md: and up, where the sidebar sits inline instead of floating.
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-10 px-4 pb-8 pt-16 sm:px-6 md:pt-8">
      {turns.map((turn) => (
        <article key={turn.id} className="flex flex-col gap-5">
          <div className="flex justify-end">
            <p className="message-enter research-surface max-w-[85%] rounded-2xl rounded-br-sm px-4 py-3 text-sm font-light leading-relaxed text-fg sm:max-w-[72%]">{turn.freeText}</p>
          </div>
          <div className="message-enter flex min-w-0 items-start gap-3">
            <span aria-hidden="true" className="mt-1 grid size-7 shrink-0 place-items-center rounded-full border border-border bg-[#121212] text-[10px] font-medium text-fg">F</span>
            <div className="research-surface min-w-0 flex-1 rounded-2xl rounded-tl-sm px-4 py-5 sm:px-6">
              <TurnResult turn={turn} onRetry={onRetryTurn} />
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}
