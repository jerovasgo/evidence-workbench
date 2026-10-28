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
  /**
   * 2026-10-28 conversational-flow pass: the turn appears in the thread the instant
   * it's sent (`sending`), not after the POST resolves — `runId` stays null until
   * then. `error` means the POST itself failed; the question is kept, never dropped,
   * so `retryTurn` can resend it. Absent once a real run is underway/finished.
   */
  status?: 'sending' | 'error';
  errorMessage?: string;
}

export interface UseConversationsResult {
  conversations: ConversationSummary[];
  activeConversationId: string | null;
  turns: Turn[];
  sending: boolean;
  error: string | null;
  sendMessage: (freeText: string, mode: Mode) => Promise<void>;
  retryTurn: (turnId: string) => void;
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
  const activeConversationIdRef = useRef(activeConversationId);
  activeConversationIdRef.current = activeConversationId;

  const refreshList = useCallback(async () => {
    const res = await fetch('/api/conversations');
    if (!res.ok) return;
    const body = await res.json();
    setConversations(body.conversations);
  }, []);

  useEffect(() => {
    void refreshList();
  }, [refreshList]);

  /** POSTs one turn (fresh or retried) and reconciles the optimistic `turnId` entry with the result — never removes it, win or lose. */
  const submitTurn = useCallback(
    async (turnId: string, freeText: string, mode: Mode) => {
      setSending(true);
      setError(null);

      try {
        const res = await fetch('/api/runs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ freeText, userId: null, mode, conversationId: activeConversationIdRef.current ?? undefined }),
        });
        const body = await res.json();

        if (!res.ok) {
          setTurns((prev) =>
            prev.map((t) => (t.id === turnId ? { ...t, status: 'error', errorMessage: body.error ?? 'Something went wrong. Please rephrase and try again.' } : t)),
          );
          return;
        }

        setTurns((prev) =>
          prev.map((t) => (t.id === turnId ? { id: body.runId, freeText, mode, runId: body.runId, intent: body.intent ?? null } : t)),
        );
        if (body.conversationId !== activeConversationIdRef.current) {
          setActiveConversationId(body.conversationId);
        }
        await refreshList();
      } catch {
        setTurns((prev) => prev.map((t) => (t.id === turnId ? { ...t, status: 'error', errorMessage: 'Could not reach the server. Please try again.' } : t)));
      } finally {
        setSending(false);
      }
    },
    [refreshList],
  );

  const sendMessage = useCallback(
    async (freeText: string, mode: Mode) => {
      const trimmed = freeText.trim();
      if (!trimmed) return;
      const turnId = `pending-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      // Appears in the thread immediately — before the POST even starts, not after it resolves.
      setTurns((prev) => [...prev, { id: turnId, freeText: trimmed, mode, runId: null, intent: null, status: 'sending' }]);
      await submitTurn(turnId, trimmed, mode);
    },
    [submitTurn],
  );

  const retryTurn = useCallback(
    (turnId: string) => {
      setTurns((prev) => {
        const turn = prev.find((t) => t.id === turnId);
        if (!turn || turn.status !== 'error') return prev;
        void submitTurn(turnId, turn.freeText, turn.mode);
        return prev.map((t) => (t.id === turnId ? { ...t, status: 'sending', errorMessage: undefined } : t));
      });
    },
    [submitTurn],
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
    if (!res.ok) {
      setError('Could not load that conversation. Please try again.');
      return;
    }
    const body = await res.json();
    setError(null);
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
    retryTurn,
    selectConversation,
    newResearch,
    renameConversation,
    deleteConversation,
  };
}
