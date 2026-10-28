'use client';

import { useEffect, useRef, useState } from 'react';
import type { Claim, Receipt, RunEvent } from '@/shared/domain';

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
  stages: Record<StageName, StageState>;
  sourceProgress: string[];
  claims: Claim[] | null;
  receipt: Receipt | null;
  status: 'streaming' | 'done' | 'partial' | 'abstained' | 'failed';
  errorMessage: string | null;
}

const STAGE_ORDER: StageName[] = ['structure', 'plan', 'retrieve', 'classify', 'extract'];

function initialState(): RunStreamState {
  return {
    stages: Object.fromEntries(STAGE_ORDER.map((s) => [s, { status: 'pending' }])) as Record<StageName, StageState>,
    sourceProgress: [],
    claims: null,
    receipt: null,
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
    };

    source.onerror = () => {
      setState((prev) => (prev.status === 'streaming' ? { ...prev, status: 'failed', errorMessage: prev.errorMessage ?? 'Connection to the server was lost.' } : prev));
      source.close();
    };

    return () => source.close();
  }, [streamUrl]);

  return state;
}

function applyEvent(prev: RunStreamState, event: RunEvent): RunStreamState {
  switch (event.type) {
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
    case 'band_ready':
      return { ...prev, claims: (event.payload as { claims: Claim[] }).claims };
    case 'receipt_ready':
      return { ...prev, receipt: event.receipt };
    case 'error':
      return { ...prev, errorMessage: event.message };
    case 'done':
      return { ...prev, status: event.status };
    default:
      return prev;
  }
}
