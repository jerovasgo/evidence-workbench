import { describe, expect, it } from 'vitest';
import { compactConversationContext, CONVERSATION_MEMORY_TTL_MS, type ConversationMemoryTurn } from './conversation-memory';

function turn(id: string, capturedAt: number): ConversationMemoryTurn {
  return { id, query: `question ${id}`, runId: null, intent: null, findings: [], sources: [], capturedAt };
}

describe('temporary conversation memory', () => {
  it('keeps only three fresh turns', () => {
    const now = 10_000_000;
    const result = compactConversationContext(
      '11111111-1111-4111-8111-111111111111',
      [1, 2, 3, 4, 5].map((id) => turn(String(id), now - id)),
      now,
    );
    expect(result.turns.map((entry) => entry.id)).toEqual(['3', '4', '5']);
  });

  it('drops expired turns instead of restoring them', () => {
    const now = 10_000_000;
    const result = compactConversationContext(
      '11111111-1111-4111-8111-111111111111',
      [turn('expired', now - CONVERSATION_MEMORY_TTL_MS), turn('fresh', now - 1)],
      now,
    );
    expect(result.turns.map((entry) => entry.id)).toEqual(['fresh']);
  });

  it('keeps independent conversation identifiers isolated', () => {
    const now = 10_000_000;
    const first = compactConversationContext('11111111-1111-4111-8111-111111111111', [turn('a', now)], now);
    const second = compactConversationContext('22222222-2222-4222-8222-222222222222', [turn('b', now)], now);
    expect(first.id).not.toBe(second.id);
    expect(first.turns[0]?.query).not.toBe(second.turns[0]?.query);
  });

  it('keeps the worst-case request capsule bounded', () => {
    const now = 10_000_000;
    const oversized = Array.from({ length: 6 }, (_, index): ConversationMemoryTurn => ({
      id: `turn-${index}`,
      query: 'q'.repeat(1500),
      runId: null,
      intent: 'comparison',
      overview: 'o'.repeat(900),
      findings: Array.from({ length: 6 }, (_, finding) => ({ id: `${index}-${finding}`, text: 'f'.repeat(360), sourceTitle: 't'.repeat(220) })),
      sources: Array.from({ length: 6 }, (_, source) => ({ id: `${index}-${source}`, title: 's'.repeat(220) })),
      capturedAt: now,
    }));
    const result = compactConversationContext('11111111-1111-4111-8111-111111111111', oversized, now);
    expect(result.turns).toHaveLength(3);
    expect(JSON.stringify(result).length).toBeLessThan(18_000);
  });
});
