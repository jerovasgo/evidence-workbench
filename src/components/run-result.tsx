'use client';

import { useState } from 'react';
import * as Tabs from '@radix-ui/react-tabs';
import type { Claim } from '@/shared/domain';
import { ClaimCard } from '@/components/claim-card';
import { EvidenceDrawer } from '@/components/evidence-drawer';
import { StageProgress } from '@/components/stage-progress';
import { Chip } from '@/components/ui/chip';
import { useRunStream } from '@/lib/use-run-stream';
import type { Mode } from '@/lib/modes';

// The live/finished result of one run: stage progress while streaming, then view
// tabs (Evidence is real; Algorithm/Map/Matrix/Mechanism are explicit "not built
// yet" placeholders — modules 06/07/08 don't exist, never silently hidden) and a
// receipt footer. Shared between the standalone run page
// (src/app/runs/[id]/run-view.tsx) and the dashboard's conversation thread
// (src/components/dashboard/conversation-thread.tsx) — both need the exact same
// SSE-driven rendering, not a re-implementation.

const PLACEHOLDER_VIEWS = [
  { value: 'algorithm', label: 'Algorithm' },
  { value: 'map', label: 'Map' },
  { value: 'matrix', label: 'Matrix' },
  { value: 'mechanism', label: 'Mechanism' },
] as const;

/** Mode only ever picks which tab opens by default — it never changes what's rendered (lib/modes.ts). */
function defaultTabForMode(mode: Mode | undefined): string {
  if (mode === 'algorithm') return 'algorithm';
  if (mode === 'evidence_map') return 'map';
  return 'evidence';
}

export function RunResult({ runId, mode }: { runId: string; mode?: Mode }) {
  const { stages, sourceProgress, claims, sourceScores, receipt, status, errorMessage } = useRunStream(`/api/runs/${runId}/stream`);
  const [selectedClaim, setSelectedClaim] = useState<Claim | null>(null);

  const isStreaming = status === 'streaming';

  return (
    <div className="flex flex-col gap-6">
      {isStreaming && <StageProgress stages={stages} sourceProgress={sourceProgress} />}

      {errorMessage && (
        <div role="alert" className="rounded-[var(--radius-card)] border border-conflict/40 bg-black/40 p-4 text-sm text-conflict">
          {errorMessage}
        </div>
      )}

      {!isStreaming && !errorMessage && (
        <p className="text-xs text-muted">
          Run {status === 'done' ? 'complete' : status === 'partial' ? 'finished with gaps' : status}.
        </p>
      )}

      <Tabs.Root defaultValue={defaultTabForMode(mode)} className="flex flex-col gap-4">
        <Tabs.List className="flex flex-wrap gap-1 border-b border-border" aria-label="Views">
          <Tabs.Trigger
            value="evidence"
            className="rounded-t-[var(--radius-chip)] px-3 py-2 text-sm text-muted data-[state=active]:border-b-2 data-[state=active]:border-fg data-[state=active]:text-fg"
          >
            Evidence
          </Tabs.Trigger>
          {PLACEHOLDER_VIEWS.map((view) => (
            <Tabs.Trigger
              key={view.value}
              value={view.value}
              className="rounded-t-[var(--radius-chip)] px-3 py-2 text-sm text-muted data-[state=active]:border-b-2 data-[state=active]:border-fg data-[state=active]:text-fg"
            >
              {view.label}
            </Tabs.Trigger>
          ))}
        </Tabs.List>

        <Tabs.Content value="evidence" className="flex flex-col gap-3">
          {claims === null && isStreaming && <p className="text-sm text-muted">Gathering and verifying sources…</p>}
          {claims !== null && claims.length === 0 && (
            <p className="text-sm text-muted">
              No claims passed verification yet. This is shown explicitly, not left blank — see the receipt below for what was checked.
            </p>
          )}
          {claims !== null && claims.length > 0 && (
            <ul className="flex flex-col gap-3">
              {claims.map((claim) => (
                <ClaimCard key={claim.id} claim={claim} onOpenEvidence={setSelectedClaim} />
              ))}
            </ul>
          )}
        </Tabs.Content>

        {PLACEHOLDER_VIEWS.map((view) => (
          <Tabs.Content
            key={view.value}
            value={view.value}
            className="rounded-[var(--radius-card)] border border-border bg-black/40 p-6 text-center text-sm text-muted"
          >
            The {view.label} view isn&rsquo;t built yet — the Evidence tab shows what has been verified so far.
          </Tabs.Content>
        ))}
      </Tabs.Root>

      {receipt && (
        <footer className="rounded-[var(--radius-card)] border border-border bg-black/40 p-4 text-xs text-muted">
          <div className="flex flex-wrap gap-3">
            <Chip>{receipt.claimsTotal} claims checked</Chip>
            <Chip>{receipt.quotesFound} quotes verified</Chip>
            {receipt.retracted > 0 && <Chip tone="conflict">{receipt.retracted} retracted source(s) excluded</Chip>}
            <Chip>{receipt.supported} fully supported by support-judge</Chip>
          </div>
          <p className="mt-2">Generated {new Date(receipt.generatedAt).toLocaleString()}</p>
        </footer>
      )}

      <EvidenceDrawer claim={selectedClaim} sourceScore={selectedClaim ? (sourceScores?.[selectedClaim.sourceId] ?? null) : null} onClose={() => setSelectedClaim(null)} />
    </div>
  );
}
