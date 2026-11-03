'use client';

import { Sidebar } from '@/components/dashboard/sidebar';
import { ConversationThread } from '@/components/dashboard/conversation-thread';
import { Composer } from '@/components/dashboard/composer';
import { EmptyState } from '@/components/dashboard/empty-state';
import { useConversations } from '@/lib/use-conversations';
import type { Mode } from '@/lib/modes';
import type { ResearchDepth } from '@/lib/research-depth';

export function DashboardView({ initialQuery, initialMode, initialDepth }: { initialQuery?: string; initialMode?: Mode; initialDepth?: ResearchDepth }) {
  const { turns, sending, sendMessage, retryTurn, newResearch, updateTurnMemory, loadPrecomputedTurn } = useConversations(initialQuery, initialMode, initialDepth);

  const hasActiveThread = turns.length > 0;

  return (
    <div className="flex h-screen">
      <Sidebar onNew={newResearch} />

      <div className="flex min-w-0 flex-1 flex-col">
        {hasActiveThread ? (
          <>
            <div className="flex-1 overflow-y-auto">
              <ConversationThread turns={turns} onRetryTurn={retryTurn} onMemoryUpdate={updateTurnMemory} />
            </div>
            <Composer onSend={(text, mode, depth) => void sendMessage(text, mode, depth)} sending={sending} />
          </>
        ) : (
          <EmptyState onSend={(text, mode, depth) => void sendMessage(text, mode, depth)} onSelectPrecomputed={loadPrecomputedTurn} />
        )}
      </div>
    </div>
  );
}
