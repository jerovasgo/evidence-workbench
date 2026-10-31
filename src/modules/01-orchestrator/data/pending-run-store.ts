import type { SupabaseClient } from '@supabase/supabase-js';
import { buildAad, decryptField, encryptField, type EncryptedBlob, type EncryptionKeyring } from '@/shared/security';
import type { PendingRunContext, PendingRunContextStore } from '../server/pending-run-context';

// Module 01 reliability fix (2026-10-31, docs/DECISIONS.md, supabase/migrations/
// 0005_pending_run_context.sql): the production `PendingRunContextStore`. Replaces
// the in-memory `Map` (server/pending-run-context.ts) because Vercel's serverless
// functions give no guarantee the POST that creates a run and the immediately-
// following GET that streams it land on the same process — an in-memory handoff
// silently drops there. Durable but still NOT conversation history: single-use
// (deleted on `take`), never listed or shown anywhere, and opportunistically swept
// after an hour if a run is abandoned before it ever streams. The whole context is
// encrypted as one JSON blob (not per-field) since it's always read/written whole.

const SWEEP_AFTER_MS = 60 * 60 * 1000; // 1 hour

interface Row {
  run_id: string;
  encrypted_context: EncryptedBlob;
}

export function createSupabasePendingRunContextStore(
  client: SupabaseClient,
  keyring: EncryptionKeyring,
): PendingRunContextStore {
  return {
    async put(runId, context) {
      const encrypted = encryptField(JSON.stringify(context), buildAad('pending_run_context', runId), keyring);
      const { error } = await client.from('pending_run_context').upsert({ run_id: runId, encrypted_context: encrypted });
      if (error) throw new Error(`pending_run_context upsert failed: ${error.message}`);

      // Fire-and-forget: bounds table growth for runs that are abandoned before
      // ever streaming (never a reason to fail the caller's own insert over this).
      void client
        .from('pending_run_context')
        .delete()
        .lt('created_at', new Date(Date.now() - SWEEP_AFTER_MS).toISOString())
        .then(() => undefined, () => undefined);
    },

    async take(runId) {
      const { data, error } = await client.from('pending_run_context').select('run_id, encrypted_context').eq('run_id', runId).maybeSingle();
      if (error || !data) return null;
      const row = data as Row;

      await client.from('pending_run_context').delete().eq('run_id', runId);

      try {
        const plaintext = decryptField(row.encrypted_context, buildAad('pending_run_context', runId), keyring);
        return JSON.parse(plaintext) as PendingRunContext;
      } catch {
        return null;
      }
    },
  };
}
