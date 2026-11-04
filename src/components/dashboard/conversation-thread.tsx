import { TurnResult } from '@/components/dashboard/turn-result';
import type { Turn, TurnMemorySnapshot } from '@/lib/use-conversations';
import Image from 'next/image';

export function ConversationThread({ turns, onRetryTurn, onMemoryUpdate, onRunStatusChange }: { turns: Turn[]; onRetryTurn: (turnId: string) => void; onMemoryUpdate: (turnId: string, snapshot: TurnMemorySnapshot) => void; onRunStatusChange: (runId: string, status: 'streaming' | 'done' | 'partial' | 'abstained' | 'failed' | 'cancelled') => void }) {
  return (
    // pt-16 clears the fixed mobile hamburger trigger (Sidebar, top-4 + h-9); not
    // needed at md: and up, where the sidebar sits inline instead of floating.
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-10 px-4 pb-8 pt-16 sm:px-6 md:pt-8">
      {turns.map((turn, index) => (
        <article key={turn.id} className="flex flex-col gap-5">
          <div className="flex justify-end">
            <p className="message-enter research-surface max-w-[85%] rounded-2xl rounded-br-sm px-4 py-3 text-sm font-light leading-relaxed text-fg sm:max-w-[72%]">{turn.freeText}</p>
          </div>
          <div className="message-enter flex min-w-0 items-start gap-3">
            <span aria-hidden="true" className="mt-1 grid size-7 shrink-0 place-items-center overflow-hidden rounded-full border border-border bg-[#121212] p-1">
              <Image src="/brand/genebark-mark-white.png" alt="" width={22} height={22} className="size-full object-contain" />
            </span>
            {/* 2026-11-02 (docs/DECISIONS.md): the response used to sit inside a
                research-surface card; the content now renders directly on the
                black background, matching the user-message bubble's own
                "editorial, not boxed" reply. Sub-surfaces (the Evidence & Sources
                accordions, the Algorithm/Mechanism/Map canvases) keep their own
                framing — only this outer wrapper is frameless. */}
            <div className="min-w-0 flex-1 pt-1">
              <TurnResult turn={turn} onRetry={onRetryTurn} onMemoryUpdate={onMemoryUpdate} onStatusChange={index === turns.length - 1 ? onRunStatusChange : undefined} />
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}
