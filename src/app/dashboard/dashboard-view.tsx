'use client';

import { Sidebar } from '@/components/dashboard/sidebar';
import { ConversationThread } from '@/components/dashboard/conversation-thread';
import { Composer } from '@/components/dashboard/composer';
import { EmptyState } from '@/components/dashboard/empty-state';
import { useConversations } from '@/lib/use-conversations';
import type { Mode } from '@/lib/modes';
import type { ResearchDepth } from '@/lib/research-depth';
import { useCallback, useState } from 'react';

export function DashboardView({ initialQuery, initialMode, initialDepth }: { initialQuery?: string; initialMode?: Mode; initialDepth?: ResearchDepth }) {
  const { turns, sending, sendMessage, retryTurn, cancelPendingSubmission, newResearch, updateTurnMemory, loadPrecomputedTurn, mode, depth, setMode, setDepth } = useConversations(initialQuery, initialMode, initialDepth);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);

  const handleRunStatusChange = useCallback((runId: string, status: 'streaming' | 'done' | 'partial' | 'abstained' | 'failed' | 'cancelled') => {
    if (status === 'streaming') setActiveRunId(runId);
    else setActiveRunId((current) => current === runId ? null : current);
  }, []);

  const stopActiveResearch = useCallback(() => {
    if (sending) cancelPendingSubmission();
    if (activeRunId) {
      void fetch(`/api/runs/${activeRunId}/cancel`, { method: 'DELETE' });
      setActiveRunId(null);
    }
  }, [activeRunId, cancelPendingSubmission, sending]);

  const hasActiveThread = turns.length > 0;

  return (
    <div className="flex h-screen">
      <Sidebar onNew={newResearch} />

      <div className="flex min-w-0 flex-1 flex-col">
        {hasActiveThread ? (
          <>
            <div className="flex-1 overflow-y-auto">
              <ConversationThread turns={turns} onRetryTurn={retryTurn} onMemoryUpdate={updateTurnMemory} onRunStatusChange={handleRunStatusChange} />
            </div>
            <Composer onSend={(text, mode, depth) => void sendMessage(text, mode, depth)} sending={sending} researching={Boolean(activeRunId)} onStop={stopActiveResearch} mode={mode} depth={depth} onModeChange={setMode} onDepthChange={setDepth} />
          </>
        ) : (
          <EmptyState onSend={(text, mode, depth) => void sendMessage(text, mode, depth)} onSelectPrecomputed={loadPrecomputedTurn} mode={mode} depth={depth} onModeChange={setMode} onDepthChange={setDepth} />
        )}
      </div>
    </div>
  );
}
