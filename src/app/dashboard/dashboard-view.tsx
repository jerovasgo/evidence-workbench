'use client';

import { Sidebar } from '@/components/dashboard/sidebar';
import { ConversationThread } from '@/components/dashboard/conversation-thread';
import { Composer } from '@/components/dashboard/composer';
import { EmptyState } from '@/components/dashboard/empty-state';
import { useConversations } from '@/lib/use-conversations';
import type { Mode } from '@/lib/modes';

export function DashboardView({ initialQuery, initialMode }: { initialQuery?: string; initialMode?: Mode }) {
  const {
    conversations,
    activeConversationId,
    turns,
    sending,
    error,
    sendMessage,
    selectConversation,
    newResearch,
    renameConversation,
    deleteConversation,
  } = useConversations(initialQuery, initialMode);

  const hasActiveThread = turns.length > 0;

  return (
    <div className="flex h-screen">
      <Sidebar
        conversations={conversations}
        activeConversationId={activeConversationId}
        onSelect={(id) => void selectConversation(id)}
        onNew={newResearch}
        onRename={(id, title) => void renameConversation(id, title)}
        onDelete={(id) => void deleteConversation(id)}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        {hasActiveThread ? (
          <>
            <div className="flex-1 overflow-y-auto">
              <ConversationThread turns={turns} />
            </div>
            {error && (
              <p role="alert" className="mx-auto w-full max-w-3xl px-6 text-sm text-conflict">
                {error}
              </p>
            )}
            <Composer onSend={(text, mode) => void sendMessage(text, mode)} sending={sending} />
          </>
        ) : (
          <EmptyState onSend={(text, mode) => void sendMessage(text, mode)} />
        )}
      </div>
    </div>
  );
}
