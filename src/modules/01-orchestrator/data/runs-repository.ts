import type { SupabaseClient } from '@supabase/supabase-js';

// Thin data-access layer over the `runs` table (supabase/migrations/0001_init_core_schema.sql).
// Kept separate from src/lib/pipeline/create-run.ts so that pipeline logic can be unit
// tested against an in-memory fake instead of a real Supabase connection.

export interface RunRecord {
  id: string;
  userId: string | null;
  isPrecomputed: boolean;
  intent: string;
  status: 'queued' | 'routing' | 'running' | 'partial' | 'done' | 'abstained' | 'failed';
  createdAt: string;
}

export interface CreateRunInput {
  /** Supplied by the caller so the same id can key the budget guard and trace before the row exists. */
  id?: string;
  userId: string | null;
  isPrecomputed: boolean;
  intent: string;
  status: RunRecord['status'];
}

export interface RunsRepository {
  createRun(input: CreateRunInput): Promise<RunRecord>;
  getRun(id: string): Promise<RunRecord | null>;
}

interface RunRow {
  id: string;
  user_id: string | null;
  is_precomputed: boolean;
  intent: string;
  status: RunRecord['status'];
  created_at: string;
}

function mapRow(row: RunRow): RunRecord {
  return {
    id: row.id,
    userId: row.user_id,
    isPrecomputed: row.is_precomputed,
    intent: row.intent,
    status: row.status,
    createdAt: row.created_at,
  };
}

export function createSupabaseRunsRepository(client: SupabaseClient): RunsRepository {
  return {
    async createRun(input) {
      const { data, error } = await client
        .from('runs')
        .insert({
          ...(input.id ? { id: input.id } : {}),
          user_id: input.userId,
          is_precomputed: input.isPrecomputed,
          intent: input.intent,
          status: input.status,
        })
        .select()
        .single();

      if (error) {
        throw new Error(`createRun failed: ${error.message}`);
      }
      return mapRow(data as RunRow);
    },

    async getRun(id) {
      const { data, error } = await client.from('runs').select('*').eq('id', id).maybeSingle();

      if (error) {
        throw new Error(`getRun failed: ${error.message}`);
      }
      return data ? mapRow(data as RunRow) : null;
    },
  };
}
