import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import { createSingleKeyKeyring } from '@/shared/security';
import { createSupabaseConversationsRepository } from './conversations-repository';

const keyring = createSingleKeyKeyring(Buffer.alloc(32, 7));

function fakeClient() {
  const tables: Record<string, { insert: unknown[]; rows: Record<string, unknown>[] }> = {
    conversations: { insert: [], rows: [] },
    conversation_turns: { insert: [], rows: [] },
  };

  function makeQuery(tableName: string) {
    let filtered = tables[tableName]!.rows;
    const chain = {
      select: vi.fn(() => chain),
      insert: vi.fn((row: Record<string, unknown>) => {
        tables[tableName]!.insert.push(row);
        tables[tableName]!.rows.push(row);
        return Promise.resolve({ error: null });
      }),
      update: vi.fn((patch: Record<string, unknown>) => {
        filtered.forEach((row) => Object.assign(row, patch));
        return chain;
      }),
      delete: vi.fn(() => chain),
      eq: vi.fn((key: string, value: unknown) => {
        filtered = filtered.filter((row) => row[key] === value);
        return chain;
      }),
      order: vi.fn(() => Promise.resolve({ data: filtered, error: null })),
      maybeSingle: vi.fn(() => Promise.resolve({ data: filtered[0] ?? null, error: null })),
      then: (resolve: (v: { data: Record<string, unknown>[]; error: null }) => void) => resolve({ data: filtered, error: null }),
    };
    return chain;
  }

  const client = { from: vi.fn((tableName: string) => makeQuery(tableName)) } as unknown as SupabaseClient;
  return { client, tables };
}

describe('createSupabaseConversationsRepository', () => {
  it('creates a conversation with its first turn, round-tripping the encrypted free text', async () => {
    const { client } = fakeClient();
    const repo = createSupabaseConversationsRepository(client, keyring);

    const { conversationId } = await repo.create({
      sessionId: 'session_1',
      title: 'Suspected ACS',
      mode: 'auto',
      freeText: 'Suspected acute coronary syndrome in the ED',
      runId: 'run_1',
    });

    const result = await repo.getWithTurns(conversationId, 'session_1');
    expect(result).not.toBeNull();
    expect(result!.turns).toHaveLength(1);
    expect(result!.turns[0]!.freeText).toBe('Suspected acute coronary syndrome in the ED');
    expect(result!.turns[0]!.runId).toBe('run_1');
  });

  it('returns null from getWithTurns for a conversation belonging to a different session', async () => {
    const { client } = fakeClient();
    const repo = createSupabaseConversationsRepository(client, keyring);
    const { conversationId } = await repo.create({ sessionId: 'session_1', title: 'x', mode: 'auto', freeText: 'x' });

    expect(await repo.getWithTurns(conversationId, 'session_2')).toBeNull();
  });

  it('addTurn returns null (not an error) when the conversation does not belong to this session', async () => {
    const { client } = fakeClient();
    const repo = createSupabaseConversationsRepository(client, keyring);
    const { conversationId } = await repo.create({ sessionId: 'session_1', title: 'x', mode: 'auto', freeText: 'x' });

    const result = await repo.addTurn({ conversationId, sessionId: 'session_2', mode: 'auto', freeText: 'y' });
    expect(result).toBeNull();
  });

  it('appends a second turn to the same conversation', async () => {
    const { client } = fakeClient();
    const repo = createSupabaseConversationsRepository(client, keyring);
    const { conversationId } = await repo.create({ sessionId: 'session_1', title: 'x', mode: 'auto', freeText: 'first question' });

    await repo.addTurn({ conversationId, sessionId: 'session_1', mode: 'algorithm', freeText: 'second question' });

    const result = await repo.getWithTurns(conversationId, 'session_1');
    expect(result!.turns.map((t) => t.freeText)).toEqual(['first question', 'second question']);
  });

  it('lists conversations scoped to a session', async () => {
    const { client } = fakeClient();
    const repo = createSupabaseConversationsRepository(client, keyring);
    await repo.create({ sessionId: 'session_1', title: 'A', mode: 'auto', freeText: 'x' });
    await repo.create({ sessionId: 'session_2', title: 'B', mode: 'auto', freeText: 'y' });

    const list = await repo.listForSession('session_1');
    expect(list).toHaveLength(1);
    expect(list[0]!.title).toBe('A');
  });

  it('rename and remove return false for a conversation owned by a different session', async () => {
    const { client } = fakeClient();
    const repo = createSupabaseConversationsRepository(client, keyring);
    const { conversationId } = await repo.create({ sessionId: 'session_1', title: 'x', mode: 'auto', freeText: 'x' });

    expect(await repo.rename(conversationId, 'session_2', 'new title')).toBe(false);
    expect(await repo.remove(conversationId, 'session_2')).toBe(false);
  });

  it('rename and remove succeed for the owning session', async () => {
    const { client } = fakeClient();
    const repo = createSupabaseConversationsRepository(client, keyring);
    const { conversationId } = await repo.create({ sessionId: 'session_1', title: 'x', mode: 'auto', freeText: 'x' });

    expect(await repo.rename(conversationId, 'session_1', 'renamed')).toBe(true);
    expect(await repo.remove(conversationId, 'session_1')).toBe(true);
  });

  describe('getTurnByRunId', () => {
    it('recovers the free text for the owning session (cross-process pendingRunContext fallback)', async () => {
      const { client } = fakeClient();
      const repo = createSupabaseConversationsRepository(client, keyring);
      await repo.create({ sessionId: 'session_1', title: 'x', mode: 'auto', freeText: 'What is the role of BRCA1?', runId: 'run_1' });

      const result = await repo.getTurnByRunId('run_1', 'session_1');
      expect(result).toEqual({ freeText: 'What is the role of BRCA1?' });
    });

    it('returns null for a different session (never decrypts under the wrong owner)', async () => {
      const { client } = fakeClient();
      const repo = createSupabaseConversationsRepository(client, keyring);
      await repo.create({ sessionId: 'session_1', title: 'x', mode: 'auto', freeText: 'x', runId: 'run_1' });

      expect(await repo.getTurnByRunId('run_1', 'session_2')).toBeNull();
    });

    it('returns null when no turn references this run id', async () => {
      const { client } = fakeClient();
      const repo = createSupabaseConversationsRepository(client, keyring);

      expect(await repo.getTurnByRunId('run_missing', 'session_1')).toBeNull();
    });
  });
});
