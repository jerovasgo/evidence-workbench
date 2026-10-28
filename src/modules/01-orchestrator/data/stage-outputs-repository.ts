import type { SupabaseClient } from '@supabase/supabase-js';

// Module 01 resumability: `supabase/migrations/0001_init_core_schema.sql`'s
// `stage_outputs` table ("Per-stage resumption state") existed since Day 1 but
// nothing wrote to it (SECURITY.md known gap) — every run restarted every stage
// from scratch on any retry/reconnect. This repository is what finally uses it.
//
// `payload_ref` stores `{ value, reasons }` directly as jsonb — the "_ref" in its
// name suggests a future pointer into a separate blob store, but at this project's
// scale (CandidateSource[]/Claim[] arrays, a few KB to tens of KB per run) storing
// the value inline is the honest Day-1 choice; no such blob store exists yet. This
// is structured, derived output (a `ScenarioStructure`, a `SearchPlan`, verified
// `Claim`s with their short quotes) — never the raw scenario free text or full
// fetched document text, which CLAUDE.md rule 3 says must never be persisted; that
// rule is about raw input/document text, not the product's own verified-claim
// output, which SPEC §8 already designs as persisted data (`Run`, `Claim`).
//
// No unique constraint on (run_id, stage): a stage is always INSERTed fresh, never
// UPDATEd in place, so a retried stage's history isn't silently overwritten; readers
// take the most recent row per stage (`created_at desc`).

export interface StageOutputRecord<T = unknown> {
  stage: string;
  status: 'ok' | 'partial' | 'abstain' | 'failed';
  value?: T;
  reasons?: string[];
  metrics: { ms: number; costUsd: number; counts?: Record<string, number> };
  createdAt: string;
}

export interface InsertStageOutputInput {
  runId: string;
  stage: string;
  status: StageOutputRecord['status'];
  value?: unknown;
  reasons?: string[];
  metrics: StageOutputRecord['metrics'];
}

export interface StageOutputsRepository {
  insert(input: InsertStageOutputInput): Promise<void>;
  /** The most recent row per stage for this run, keyed by stage name. */
  getLatestPerStage(runId: string): Promise<Map<string, StageOutputRecord>>;
}

interface StageOutputRow {
  stage: string;
  status: StageOutputRecord['status'];
  payload_ref: { value?: unknown; reasons?: string[] } | null;
  metrics: StageOutputRecord['metrics'];
  created_at: string;
}

export function createSupabaseStageOutputsRepository(client: SupabaseClient): StageOutputsRepository {
  return {
    async insert(input) {
      const { error } = await client.from('stage_outputs').insert({
        run_id: input.runId,
        stage: input.stage,
        status: input.status,
        payload_ref: { value: input.value, reasons: input.reasons },
        metrics: input.metrics,
      });

      if (error) {
        throw new Error(`stage_outputs insert failed: ${error.message}`);
      }
    },

    async getLatestPerStage(runId) {
      const { data, error } = await client
        .from('stage_outputs')
        .select('stage, status, payload_ref, metrics, created_at')
        .eq('run_id', runId)
        .order('created_at', { ascending: false });

      if (error) {
        throw new Error(`stage_outputs select failed: ${error.message}`);
      }

      const rows = (data ?? []) as StageOutputRow[];
      const byStage = new Map<string, StageOutputRecord>();
      for (const row of rows) {
        if (byStage.has(row.stage)) continue; // already-seen = more recent (desc order)
        byStage.set(row.stage, {
          stage: row.stage,
          status: row.status,
          value: row.payload_ref?.value,
          reasons: row.payload_ref?.reasons,
          metrics: row.metrics,
          createdAt: row.created_at,
        });
      }
      return byStage;
    },
  };
}
