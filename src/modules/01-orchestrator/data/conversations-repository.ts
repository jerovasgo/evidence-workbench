import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { buildAad, decryptField, encryptField, type EncryptedBlob, type EncryptionKeyring } from '@/shared/security';

// Module 11 dashboard: conversation history. CLAUDE.md rule 3 scoped exception
// (2026-10-28, see docs/DECISIONS.md) — the one place scenario text is persisted,
// field-encrypted at rest (module 10). AAD binds each turn's ciphertext to its own
// session id + turn id, the same "never decrypts under the wrong owner/row" pattern
// `encryption.ts` already documents for documents/watch_definitions — a ciphertext
// copied to another turn, or read by another session, fails to decrypt rather than
// silently returning the wrong plaintext.
//
// No auth exists yet: every read/write is scoped by `sessionId` (an httpOnly cookie
// value, `src/lib/session-cookie.ts`) in application code, not by auth.uid()/RLS —
// `supabase/migrations/0004_conversations.sql`'s own comment explains why.

export interface ConversationSummary {
  id: string;
  title: string;
  mode: string;
  createdAt: string;
  updatedAt: string;
}

export interface ConversationTurn {
  id: string;
  conversationId: string;
  runId: string | null;
  mode: string;
  freeText: string;
  createdAt: string;
}

export interface CreateConversationInput {
  sessionId: string;
  title: string;
  mode: string;
  freeText: string;
  runId?: string;
}

export interface AddTurnInput {
  conversationId: string;
  sessionId: string;
  mode: string;
  freeText: string;
  runId?: string;
}

export interface ConversationsRepository {
  create(input: CreateConversationInput): Promise<{ conversationId: string; turnId: string }>;
  /** Returns null if the conversation doesn't exist or doesn't belong to sessionId. */
  addTurn(input: AddTurnInput): Promise<{ turnId: string } | null>;
  listForSession(sessionId: string): Promise<ConversationSummary[]>;
  getWithTurns(conversationId: string, sessionId: string): Promise<{ conversation: ConversationSummary; turns: ConversationTurn[] } | null>;
  rename(conversationId: string, sessionId: string, title: string): Promise<boolean>;
  remove(conversationId: string, sessionId: string): Promise<boolean>;
}

interface ConversationRow {
  id: string;
  title: string;
  mode: string;
  created_at: string;
  updated_at: string;
}

interface TurnRow {
  id: string;
  conversation_id: string;
  run_id: string | null;
  mode: string;
  encrypted_free_text: EncryptedBlob;
  created_at: string;
}

function mapConversation(row: ConversationRow): ConversationSummary {
  return { id: row.id, title: row.title, mode: row.mode, createdAt: row.created_at, updatedAt: row.updated_at };
}

function mapTurn(row: TurnRow, sessionId: string, keyring: EncryptionKeyring): ConversationTurn {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    runId: row.run_id,
    mode: row.mode,
    freeText: decryptField(row.encrypted_free_text, buildAad(sessionId, row.id), keyring),
    createdAt: row.created_at,
  };
}

export function createSupabaseConversationsRepository(client: SupabaseClient, keyring: EncryptionKeyring): ConversationsRepository {
  return {
    async create(input) {
      const conversationId = randomUUID();
      const turnId = randomUUID();

      const { error: conversationError } = await client.from('conversations').insert({
        id: conversationId,
        session_id: input.sessionId,
        title: input.title,
        mode: input.mode,
      });
      if (conversationError) throw new Error(`conversations insert failed: ${conversationError.message}`);

      const encrypted = encryptField(input.freeText, buildAad(input.sessionId, turnId), keyring);
      const { error: turnError } = await client.from('conversation_turns').insert({
        id: turnId,
        conversation_id: conversationId,
        run_id: input.runId ?? null,
        mode: input.mode,
        encrypted_free_text: encrypted,
      });
      if (turnError) throw new Error(`conversation_turns insert failed: ${turnError.message}`);

      return { conversationId, turnId };
    },

    async addTurn(input) {
      const { data: owned, error: ownerError } = await client
        .from('conversations')
        .select('id')
        .eq('id', input.conversationId)
        .eq('session_id', input.sessionId)
        .maybeSingle();
      if (ownerError) throw new Error(`conversations lookup failed: ${ownerError.message}`);
      if (!owned) return null;

      const turnId = randomUUID();
      const encrypted = encryptField(input.freeText, buildAad(input.sessionId, turnId), keyring);
      const { error: turnError } = await client.from('conversation_turns').insert({
        id: turnId,
        conversation_id: input.conversationId,
        run_id: input.runId ?? null,
        mode: input.mode,
        encrypted_free_text: encrypted,
      });
      if (turnError) throw new Error(`conversation_turns insert failed: ${turnError.message}`);

      await client.from('conversations').update({ updated_at: new Date().toISOString() }).eq('id', input.conversationId);

      return { turnId };
    },

    async listForSession(sessionId) {
      const { data, error } = await client
        .from('conversations')
        .select('id, title, mode, created_at, updated_at')
        .eq('session_id', sessionId)
        .order('updated_at', { ascending: false });
      if (error) throw new Error(`conversations select failed: ${error.message}`);
      return ((data ?? []) as ConversationRow[]).map(mapConversation);
    },

    async getWithTurns(conversationId, sessionId) {
      const { data: conversationRow, error: conversationError } = await client
        .from('conversations')
        .select('id, title, mode, created_at, updated_at')
        .eq('id', conversationId)
        .eq('session_id', sessionId)
        .maybeSingle();
      if (conversationError) throw new Error(`conversations select failed: ${conversationError.message}`);
      if (!conversationRow) return null;

      const { data: turnRows, error: turnsError } = await client
        .from('conversation_turns')
        .select('id, conversation_id, run_id, mode, encrypted_free_text, created_at')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true });
      if (turnsError) throw new Error(`conversation_turns select failed: ${turnsError.message}`);

      return {
        conversation: mapConversation(conversationRow as ConversationRow),
        turns: ((turnRows ?? []) as TurnRow[]).map((row) => mapTurn(row, sessionId, keyring)),
      };
    },

    async rename(conversationId, sessionId, title) {
      const { data, error } = await client
        .from('conversations')
        .update({ title, updated_at: new Date().toISOString() })
        .eq('id', conversationId)
        .eq('session_id', sessionId)
        .select('id');
      if (error) throw new Error(`conversations rename failed: ${error.message}`);
      return (data ?? []).length > 0;
    },

    async remove(conversationId, sessionId) {
      const { data, error } = await client
        .from('conversations')
        .delete()
        .eq('id', conversationId)
        .eq('session_id', sessionId)
        .select('id');
      if (error) throw new Error(`conversations delete failed: ${error.message}`);
      return (data ?? []).length > 0;
    },
  };
}
