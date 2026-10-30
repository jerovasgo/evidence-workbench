'use client';

import { useEffect, useRef, useState } from 'react';
import type { Claim, Receipt, RunEvent, Relation } from '@/shared/domain';
import type { ScoreBreakdown } from '@/modules/04-grading-scoring';

// Client-side consumer of GET /api/runs/:id/stream (SSE). EventSource already
// parses the `data: <json>\n\n` framing; this hook just accumulates the typed
// RunEvent stream into state a page can render incrementally (SPEC §11: "loading =
// stage progress with partial results").

export type StageName = 'structure' | 'plan' | 'retrieve' | 'classify' | 'extract';
export interface StageState {
  status: 'pending' | 'running' | 'ok' | 'partial' | 'abstain' | 'failed';
  detail?: string;
}

export interface RunStreamState {
  opening: string | null;
  overviewSources: { title: string; year?: number; url?: string }[];
  geneContext: { symbol: string; name?: string; geneId?: string; hgncId?: string; links: { label: string; url: string }[] }[];
  sourceCatalog: Record<string, { id: string; status: 'candidate'; title: string; url: string; doi?: string; pmid?: string; year?: number }>;
  stages: Record<StageName, StageState>;
  sourceProgress: string[];
  claims: Claim[] | null;
  provisionalBySource: Record<string, Claim[]>;
  withdrawals: { sourceId: string; count: number; reason?: string }[];
  sourceScores: Record<string, ScoreBreakdown> | null;
  receipt: Receipt | null;
  relations: Relation[];
  questions: string[];
  relationStatus: 'pending' | 'ok' | 'partial' | 'failed';
  status: 'streaming' | 'done' | 'partial' | 'abstained' | 'failed';
  errorMessage: string | null;
}

const STAGE_ORDER: StageName[] = ['structure', 'plan', 'retrieve', 'classify', 'extract'];

export function initialState(): RunStreamState {
  return {
    opening: null,
    overviewSources: [],
    geneContext: [],
    sourceCatalog: {},
    stages: Object.fromEntries(STAGE_ORDER.map((s) => [s, { status: 'pending' }])) as Record<StageName, StageState>,
    sourceProgress: [],
    claims: null,
    provisionalBySource: {},
    withdrawals: [],
    sourceScores: null,
    receipt: null,
    relations: [], questions: [], relationStatus: 'pending',
    status: 'streaming',
    errorMessage: null,
  };
}

export function useRunStream(streamUrl: string | null): RunStreamState {
  const [state, setState] = useState<RunStreamState>(initialState);
  const streamUrlRef = useRef(streamUrl);

  useEffect(() => {
    if (!streamUrl) return;
    if (streamUrlRef.current !== streamUrl) setState(initialState());
    streamUrlRef.current = streamUrl;

    const source = new EventSource(streamUrl);

    source.onmessage = (event) => {
      const parsed: RunEvent = JSON.parse(event.data);
      setState((prev) => applyEvent(prev, parsed));
      if (parsed.type === 'relations_ready') source.close();
    };

    source.onerror = () => {
      setState((prev) => (prev.status === 'streaming' ? { ...prev, status: 'failed', errorMessage: prev.errorMessage ?? 'Connection to the server was lost.' } : prev.relationStatus === 'pending' ? { ...prev, relationStatus: 'failed' } : prev));
      source.close();
    };

    return () => source.close();
  }, [streamUrl]);

  return state;
}

export function applyEvent(prev: RunStreamState, event: RunEvent): RunStreamState {
  switch (event.type) {
    case 'opening_ready':
      return { ...prev, opening: event.text };
    case 'overview_ready':
      return { ...prev, overviewSources: event.sources };
    case 'gene_context_ready':
      return { ...prev, geneContext: event.genes };
    case 'source_catalog_ready':
      return { ...prev, sourceCatalog: Object.fromEntries(event.sources.map((source) => [source.id, source])) };
    case 'provisional_claims_ready':
      return { ...prev, provisionalBySource: { ...prev.provisionalBySource, [event.sourceId]: event.claims } };
    case 'source_reviewed': {
      const provisionalBySource = { ...prev.provisionalBySource };
      delete provisionalBySource[event.sourceId];
      return { ...prev, provisionalBySource, withdrawals: event.withdrawnCount > 0 ? [...prev.withdrawals, { sourceId: event.sourceId, count: event.withdrawnCount, reason: event.reason }] : prev.withdrawals };
    }
    case 'stage_started':
      return { ...prev, stages: { ...prev.stages, [event.stage]: { status: 'running' } } };
    case 'stage_progress': {
      const knownStage = (STAGE_ORDER as string[]).includes(event.stage);
      if (!knownStage) return prev;
      const stage = event.stage as StageName;
      // A "source" progress line within `extract` carries no stage status of its
      // own (format: "sourceId: outcome") — keep the stage's own running state and
      // just log the line; a real stage-level update looks like "ok (1234ms)".
      const looksLikeStageStatus = /^(ok|partial|abstain|failed)\b/.test(event.detail ?? '');
      if (!looksLikeStageStatus) {
        return { ...prev, sourceProgress: [...prev.sourceProgress, event.detail ?? ''] };
      }
      const status = (event.detail ?? '').split(' ')[0] as StageState['status'];
      return { ...prev, stages: { ...prev.stages, [stage]: { status, detail: event.detail } } };
    }
    case 'band_ready': {
      const payload = event.payload as { claims: Claim[]; sourceScores?: Record<string, ScoreBreakdown> };
      return { ...prev, claims: payload.claims, sourceScores: payload.sourceScores ?? null };
    }
    case 'relations_ready':
      return { ...prev, relations: event.relations, questions: event.questions, relationStatus: event.status };
    case 'receipt_ready':
      return { ...prev, receipt: event.receipt };
    case 'error':
      return { ...prev, errorMessage: event.message, provisionalBySource: {}, withdrawals: [...prev.withdrawals, ...Object.entries(prev.provisionalBySource).map(([sourceId, claims]) => ({ sourceId, count: claims.length, reason: 'Verification was interrupted.' }))] };
    case 'done':
      return { ...prev, status: event.status, provisionalBySource: {} };
    default:
      return prev;
  }
}
