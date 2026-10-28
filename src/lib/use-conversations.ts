'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Mode } from '@/lib/modes';
import type { Intent } from '@/modules/01-orchestrator';

export interface ConversationSummary {
  id: string;
  title: string;
  mode: string;
  createdAt: string;
  updatedAt: string;
}

export interface Turn {
  id: string;
  freeText: string;
  mode: Mode;
  runId: string | null;
  /**
   * The router's (P1) real intent for this turn — only known right when it was sent
   * (the POST /api/runs response); not persisted (conversations only store
   * freeText/mode/runId), so it's `null` again after a reload / selecting an older
   * conversation. Lets the UI honestly say what "Auto" picked while the answer is
   * fresh, without inventing it on turns we no longer have it for.
   */
  intent: Intent | null;
}

export interface UseConversationsResult {
  conversations: ConversationSummary[];
  activeConversationId: string | null;
  turns: Turn[];
  sending: boolean;
  error: string | null;
  sendMessage: (freeText: string, mode: Mode) => Promise<void>;
  selectConversation: (id: string) => Promise<void>;
  newResearch: () => void;
  renameConversation: (id: string, title: string) => Promise<void>;
  deleteConversation: (id: string) => Promise<void>;
}

/** Orchestrates the dashboard's conversation state: list, active thread, sending new turns. */
export function useConversations(initialQuery?: string, initialMode?: Mode): UseConversationsResult {
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const autoSubmitted = useRef(false);

  const refreshList = useCallback(async () => {
    const res = await fetch('/api/conversations');
    if (!res.ok) return;
    const body = await res.json();
    setConversations(body.conversations);
  }, []);

  useEffect(() => {
    void refreshList();
  }, [refreshList]);

  const sendMessage = useCallback(
    async (freeText: string, mode: Mode) => {
      if (!freeText.trim() || sending) return;
      setSending(true);
      setError(null);

      try {
        const res = await fetch('/api/runs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ freeText, userId: null, mode, conversationId: activeConversationId ?? undefined }),
        });
        const body = await res.json();

        if (!res.ok) {
          setError(body.error ?? 'Something went wrong. Please rephrase and try again.');
          return;
        }

        setTurns((prev) => [...prev, { id: body.runId, freeText, mode, runId: body.runId, intent: body.intent ?? null }]);
        if (body.conversationId !== activeConversationId) {
          setActiveConversationId(body.conversationId);
        }
        await refreshList();
      } catch {
        setError('Could not reach the server. Please try again.');
      } finally {
        setSending(false);
      }
    },
    [activeConversationId, sending, refreshList],
  );

  useEffect(() => {
    if (initialQuery && !autoSubmitted.current) {
      autoSubmitted.current = true;
      void sendMessage(initialQuery, initialMode ?? 'auto');
    }
    // Intentionally fires once on mount only — initialQuery/initialMode are a
    // one-shot handoff from the landing page, not a value to keep re-syncing from.
  }, []);

  const selectConversation = useCallback(async (id: string) => {
    const res = await fetch(`/api/conversations/${id}`);
    if (!res.ok) return;
    const body = await res.json();
    setActiveConversationId(id);
    setTurns(
      body.turns.map((t: { id: string; freeText: string; mode: string; runId: string | null }) => ({
        id: t.id,
        freeText: t.freeText,
        mode: t.mode as Mode,
        runId: t.runId,
        intent: null, // not persisted — only known live, right after sending (see Turn.intent's own comment)
      })),
    );
  }, []);

  const newResearch = useCallback(() => {
    setActiveConversationId(null);
    setTurns([]);
    setError(null);
  }, []);

  const renameConversation = useCallback(async (id: string, title: string) => {
    const res = await fetch(`/api/conversations/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title }),
    });
    if (res.ok) setConversations((prev) => prev.map((c) => (c.id === id ? { ...c, title } : c)));
  }, []);

  const deleteConversation = useCallback(
    async (id: string) => {
      const res = await fetch(`/api/conversations/${id}`, { method: 'DELETE' });
      if (!res.ok) return;
      setConversations((prev) => prev.filter((c) => c.id !== id));
      if (id === activeConversationId) newResearch();
    },
    [activeConversationId, newResearch],
  );

  return {
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
  };
}
