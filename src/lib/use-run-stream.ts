'use client';

import { useEffect, useRef, useState } from 'react';
import type { Claim, Receipt, RunEvent, Relation } from '@/shared/domain';
import type { ScoreBreakdown } from '@/modules/04-grading-scoring';
import type { AlgorithmGraph } from '@/modules/06-algorithm';
import type { MechanismGraph } from '@/modules/08-mechanism';
import type { OverviewSection } from '@/modules/01-orchestrator';

// Client-side consumer of GET /api/runs/:id/stream (SSE). EventSource already
// parses the `data: <json>\n\n` framing; this hook just accumulates the typed
// RunEvent stream into state a page can render incrementally (SPEC §11: "loading =
// stage progress with partial results").

export type StageName = 'structure' | 'plan' | 'retrieve' | 'classify' | 'extract';
export interface StageState {
  status: 'pending' | 'running' | 'ok' | 'partial' | 'abstain' | 'failed';
  detail?: string;
}

export interface AgentActivity {
  callId: string;
  name: string;
  provider: 'Meta Model API';
  model: string;
  tier?: 'T0' | 'T1' | 'T2';
  status: 'running' | 'completed' | 'failed' | 'abstained';
  attempt?: 1 | 2;
  ms?: number;
  tokens?: number;
  costUsd?: number;
  reason?: string;
}

export interface RunStreamState {
  opening: string | null;
  // A provisional abstract synthesis is retained separately so it can inform
  // diagnostics without ever occupying (and later rewriting) the published
  // Overview. `opening` is write-once and contains only definitive content.
  provisionalOpening: string | null;
  openingFinal: boolean;
  // Only ever populated alongside the final overview (never the provisional one);
  // empty/null when the model found nothing beyond the lead paragraph worth adding.
  openingSections: OverviewSection[] | null;
  overviewSources: { title: string; year?: number; url?: string }[];
  geneContext: { symbol: string; kind?: 'gene' | 'protein'; name?: string; geneId?: string; hgncId?: string; links: { label: string; url: string }[] }[];
  sourceCatalog: Record<string, { id: string; status: 'candidate'; title: string; url: string; doi?: string; pmid?: string; year?: number; issuer?: string; firstAuthor?: string }>;
  stages: Record<StageName, StageState>;
  sourceProgress: string[];
  agentActivities: AgentActivity[];
  claims: Claim[] | null;
  provisionalBySource: Record<string, Claim[]>;
  qualifiedBySource: Record<string, Claim[]>;
  withdrawals: { sourceId: string; count: number; reason?: string }[];
  sourceScores: Record<string, ScoreBreakdown> | null;
  algorithm: { graph: AlgorithmGraph; band: { criticalChecks: string[]; firstAction: string | null } } | null;
  algorithmStatus: 'pending' | 'ok' | 'abstained' | 'failed';
  algorithmAbstainReason: string | null;
  mechanism: { graph: MechanismGraph } | null;
  mechanismStatus: 'pending' | 'ok' | 'abstained' | 'failed';
  mechanismAbstainReason: string | null;
  receipt: Receipt | null;
  relations: Relation[];
  questions: string[];
  relationStatus: 'pending' | 'ok' | 'partial' | 'failed';
  status: 'streaming' | 'done' | 'partial' | 'abstained' | 'failed' | 'cancelled';
  errorMessage: string | null;
}

const STAGE_ORDER: StageName[] = ['structure', 'plan', 'retrieve', 'classify', 'extract'];

export function initialState(): RunStreamState {
  return {
    opening: null,
    provisionalOpening: null,
    openingFinal: false,
    openingSections: null,
    overviewSources: [],
    geneContext: [],
    sourceCatalog: {},
    stages: Object.fromEntries(STAGE_ORDER.map((s) => [s, { status: 'pending' }])) as Record<StageName, StageState>,
    sourceProgress: [],
    agentActivities: [],
    claims: null,
    provisionalBySource: {},
    qualifiedBySource: {},
    withdrawals: [],
    sourceScores: null,
    algorithm: null,
    algorithmStatus: 'pending',
    algorithmAbstainReason: null,
    mechanism: null,
    mechanismStatus: 'pending',
    mechanismAbstainReason: null,
    receipt: null,
    relations: [], questions: [], relationStatus: 'pending',
    status: 'streaming',
    errorMessage: null,
  };
}

export interface RunStreamApi extends RunStreamState {
  /** Explicit Stop: tells the server to actually abort the run, then stops listening. */
  cancel: () => void;
}

function cancelUrlFor(streamUrl: string): string {
  return streamUrl.replace(/\/stream$/, '/cancel');
}

export function useRunStream(streamUrl: string | null): RunStreamApi {
  const [state, setState] = useState<RunStreamState>(initialState);
  const streamUrlRef = useRef(streamUrl);
  const sourceRef = useRef<EventSource | null>(null);
  const statusRef = useRef(state.status);
  statusRef.current = state.status;

  useEffect(() => {
    if (!streamUrl) return;
    if (streamUrlRef.current !== streamUrl) setState(initialState());
    streamUrlRef.current = streamUrl;

    const source = new EventSource(streamUrl);
    sourceRef.current = source;

    source.onmessage = (event) => {
      const parsed: RunEvent = JSON.parse(event.data);
      setState((prev) => applyEvent(prev, parsed));
      if (parsed.type === 'relations_ready') source.close();
    };

    source.onerror = () => {
      setState((prev) => (prev.status === 'streaming' ? { ...prev, status: 'failed', errorMessage: prev.errorMessage ?? 'Connection to the server was lost.' } : prev.relationStatus === 'pending' ? { ...prev, relationStatus: 'failed' } : prev));
      source.close();
    };

    return () => {
      source.close();
      // 2026-11-02 (docs/DECISIONS.md): a refresh, tab close, or "New research" unmount
      // while still streaming must actually stop the server-side run, not just drop the
      // client's own EventSource — sendBeacon survives the page/component going away,
      // unlike a normal fetch, and only ever sends POST (hence the cancel route accepts
      // both POST and DELETE). Deferred one tick: this project runs with React
      // `reactStrictMode: true` (next.config.mjs), which synchronously double-invokes
      // every effect in dev (mount -> synthetic cleanup -> remount) to catch exactly
      // this class of bug. An undeferred cancel fired on that synthetic phantom
      // unmount too, aborting every run before it could start (confirmed live:
      // `POST /cancel` racing the very first `GET /stream`). By the time this timeout
      // fires, a StrictMode remount has already replaced `sourceRef.current` with its
      // own new EventSource (synchronously, same tick) — so the check below only
      // fires the beacon for a real, lasting unmount.
      if (statusRef.current === 'streaming') {
        setTimeout(() => {
          if (sourceRef.current === source) navigator.sendBeacon(cancelUrlFor(streamUrl));
        }, 0);
      }
    };
  }, [streamUrl]);

  function cancel() {
    const url = streamUrlRef.current;
    if (!url) return;
    fetch(cancelUrlFor(url), { method: 'DELETE' }).catch(() => {});
    sourceRef.current?.close();
    setState((prev) => (prev.status === 'streaming' ? { ...prev, status: 'cancelled' } : prev));
  }

  return { ...state, cancel };
}

export function applyEvent(prev: RunStreamState, event: RunEvent): RunStreamState {
  switch (event.type) {
    case 'agent_activity': {
      const activity: AgentActivity = {
        callId: event.callId,
        name: event.name,
        provider: event.provider,
        model: event.model,
        tier: event.tier,
        status: event.status,
        attempt: event.attempt,
        ms: event.ms,
        tokens: event.tokens,
        costUsd: event.costUsd,
        reason: event.reason,
      };
      const previous = prev.agentActivities.find((item) => item.callId === event.callId);
      const merged = previous ? {
        ...previous,
        ...activity,
        tier: event.tier ?? previous.tier,
        attempt: event.attempt ?? previous.attempt,
        ms: event.ms ?? previous.ms,
        tokens: event.tokens ?? previous.tokens,
        costUsd: event.costUsd ?? previous.costUsd,
        reason: event.reason ?? previous.reason,
      } : activity;
      return { ...prev, agentActivities: [...prev.agentActivities.filter((item) => item.callId !== event.callId), merged].slice(-40) };
    }
    case 'opening_ready':
      if (!event.final) {
        return prev.openingFinal || prev.provisionalOpening
          ? prev
          : { ...prev, provisionalOpening: event.text };
      }
      if (prev.openingFinal) return prev;
      return { ...prev, opening: event.text, openingFinal: true, openingSections: (event.sections as OverviewSection[] | undefined) ?? [] };
    case 'overview_ready':
      return { ...prev, overviewSources: event.sources };
    case 'gene_context_ready':
      return {
        ...prev,
        geneContext: [...new Map([...prev.geneContext, ...event.genes].map((entity) => [`${entity.kind ?? 'gene'}:${entity.symbol.toUpperCase()}`, entity])).values()],
      };
    case 'source_catalog_ready':
      return { ...prev, sourceCatalog: Object.fromEntries(event.sources.map((source) => [source.id, source])) };
    case 'provisional_claims_ready':
      return { ...prev, provisionalBySource: { ...prev.provisionalBySource, [event.sourceId]: event.claims } };
    case 'qualified_claims_ready':
      return { ...prev, qualifiedBySource: { ...prev.qualifiedBySource, [event.sourceId]: event.claims } };
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
    case 'algorithm_ready': {
      const payload = event.payload as { status: 'ok'; graph: AlgorithmGraph; band: { criticalChecks: string[]; firstAction: string | null } } | { status: 'abstained'; reason: string };
      return payload.status === 'ok'
        ? { ...prev, algorithm: { graph: payload.graph, band: payload.band }, algorithmStatus: 'ok', algorithmAbstainReason: null }
        : { ...prev, algorithm: null, algorithmStatus: 'abstained', algorithmAbstainReason: payload.reason };
    }
    case 'mechanism_ready': {
      const payload = event.payload as { status: 'ok'; graph: MechanismGraph } | { status: 'abstained'; reason: string };
      return payload.status === 'ok'
        ? { ...prev, mechanism: { graph: payload.graph }, mechanismStatus: 'ok', mechanismAbstainReason: null }
        : { ...prev, mechanism: null, mechanismStatus: 'abstained', mechanismAbstainReason: payload.reason };
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
