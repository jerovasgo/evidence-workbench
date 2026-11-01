'use client';

import { comparisonClarification } from './research-intent';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Mode } from '@/lib/modes';
import { DEFAULT_RESEARCH_DEPTH, type ResearchDepth } from '@/lib/research-depth';
import type { Intent } from '@/modules/01-orchestrator';

export interface Turn {
  id: string;
  freeText: string;
  mode: Mode;
  depth?: ResearchDepth;
  runId: string | null;
  /**
   * The router's (P1) real intent for this turn — only known right when it was sent
   * (the POST /api/runs response); nothing persists it (2026-10-31, docs/DECISIONS.md:
   * no login exists yet, so no conversation history is saved either), so it's gone
   * after a reload. Lets the UI honestly say what "Auto" picked while the answer is
   * fresh, without inventing it later.
   */
  intent: Intent | null;
  /**
   * 2026-10-28 conversational-flow pass: the turn appears in the thread the instant
   * it's sent (`sending`), not after the POST resolves — `runId` stays null until
   * then. `error` means the POST itself failed; the question is kept, never dropped,
   * so `retryTurn` can resend it. Absent once a real run is underway/finished.
   */
  status?: 'sending' | 'error' | 'clarifying' | 'answered';
  answer?: string;
  clarification?: string;
  errorMessage?: string;
}

export interface UseConversationsResult {
  turns: Turn[];
  sending: boolean;
  sendMessage: (freeText: string, mode: Mode, depth?: ResearchDepth) => Promise<void>;
  retryTurn: (turnId: string) => void;
  newResearch: () => void;
  /**
   * 2026-11-01 (docs/DECISIONS.md): the hackathon-scoped precomputed-demo-runs
   * shortcut — appends a turn with its `runId`/`intent` already known and skips
   * `POST /api/runs` entirely, so `RunResult`'s `useRunStream` connects straight to
   * `GET /api/runs/:id/stream`'s existing "already finished run" instant-replay
   * path (no live retrieval, no model calls, no cost). Not a general cache: the
   * caller (`EmptyState`) only ever passes the 3 known precomputed landing-page
   * suggestions here.
   */
  loadPrecomputedTurn: (runId: string, freeText: string, mode: Mode, intent: Intent) => void;
}

/**
 * Orchestrates the dashboard's single live research thread. No conversation list,
 * no persistence across reloads (2026-10-31, docs/DECISIONS.md): no real login exists
 * yet, so there's no one to save a browsable history for — anyone can search without
 * an account, and nothing about their question is retained once the tab closes.
 * `POST /api/runs` itself still hands scenario text to the stream route via a
 * short-lived, single-use, encrypted handoff (`pendingRunContext`) — that's plumbing
 * for the live request, not history, and this hook never sees it.
 */
export function useConversations(initialQuery?: string, initialMode?: Mode, initialDepth?: ResearchDepth): UseConversationsResult {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [sending, setSending] = useState(false);
  const autoSubmitted = useRef(false);

  /** POSTs one turn (fresh or retried) and reconciles the optimistic `turnId` entry with the result — never removes it, win or lose. */
  const submitTurn = useCallback(async (turnId: string, freeText: string, mode: Mode, depth: ResearchDepth) => {
    setSending(true);

    try {
      const res = await fetch('/api/runs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ freeText, userId: null, mode, depth }),
      });
      const body = await res.json();

      if (body.status === 'direct_answer') {
        setTurns((prev) => prev.map((t) => t.id === turnId ? { ...t, status: 'answered', answer: body.answer } : t));
        return;
      }
      if (body.status === 'clarification_required') {
        setTurns((prev) => prev.map((t) => t.id === turnId ? { ...t, status: 'clarifying', clarification: body.clarification } : t));
        return;
      }

      if (!res.ok) {
        setTurns((prev) =>
          prev.map((t) => (t.id === turnId ? { ...t, status: 'error', errorMessage: body.error ?? 'Something went wrong. Please rephrase and try again.' } : t)),
        );
        return;
      }

      setTurns((prev) =>
        prev.map((t) => (t.id === turnId ? { id: body.runId, freeText, mode, depth, runId: body.runId, intent: body.intent ?? null } : t)),
      );
    } catch {
      setTurns((prev) => prev.map((t) => (t.id === turnId ? { ...t, status: 'error', errorMessage: 'Could not reach the server. Please try again.' } : t)));
    } finally {
      setSending(false);
    }
  }, []);

  const sendMessage = useCallback(
    async (freeText: string, mode: Mode, depth: ResearchDepth = DEFAULT_RESEARCH_DEPTH) => {
      if (!freeText.trim()) return;
      const previous = turns.at(-1);
      const trimmed = previous?.status === 'clarifying' ? `${previous.freeText}: ${freeText.trim()}` : freeText.trim();
      if (!trimmed) return;
      const turnId = `pending-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const clarification = comparisonClarification(trimmed);
      if (clarification) {
        setTurns((prev) => [...prev, { id: turnId, freeText: trimmed, mode, depth, runId: null, intent: null, status: 'clarifying', clarification }]);
        return;
      }
      // Appears in the thread immediately — before the POST even starts, not after it resolves.
      setTurns((prev) => [...prev, { id: turnId, freeText: trimmed, mode, depth, runId: null, intent: null, status: 'sending' }]);
      await submitTurn(turnId, trimmed, mode, depth);
    },
    [submitTurn, turns],
  );

  const retryTurn = useCallback(
    (turnId: string) => {
      setTurns((prev) => {
        const turn = prev.find((t) => t.id === turnId);
        if (!turn || turn.status !== 'error') return prev;
        void submitTurn(turnId, turn.freeText, turn.mode, turn.depth ?? DEFAULT_RESEARCH_DEPTH);
        return prev.map((t) => (t.id === turnId ? { ...t, status: 'sending', errorMessage: undefined } : t));
      });
    },
    [submitTurn],
  );

  useEffect(() => {
    if (initialQuery && !autoSubmitted.current) {
      autoSubmitted.current = true;
      void sendMessage(initialQuery, initialMode ?? 'auto', initialDepth);
    }
    // Intentionally fires once on mount only — initialQuery/initialMode are a
    // one-shot handoff from the landing page, not a value to keep re-syncing from.
  }, []);

  const newResearch = useCallback(() => {
    setTurns([]);
  }, []);

  const loadPrecomputedTurn = useCallback((runId: string, freeText: string, mode: Mode, intent: Intent) => {
    setTurns((prev) => [...prev, { id: runId, freeText, mode, runId, intent }]);
  }, []);

  return { turns, sending, sendMessage, retryTurn, newResearch, loadPrecomputedTurn };
}
