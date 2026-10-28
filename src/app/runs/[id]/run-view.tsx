'use client';

import { useState } from 'react';
import * as Tabs from '@radix-ui/react-tabs';
import type { Claim } from '@/shared/domain';
import { ClaimCard } from '@/components/claim-card';
import { EvidenceDrawer } from '@/components/evidence-drawer';
import { StageProgress } from '@/components/stage-progress';
import { Chip } from '@/components/ui/chip';
import { useRunStream } from '@/lib/use-run-stream';

// SPEC §11 screen (2): Result — "10-second band, view tabs (Algorithm | Map |
// Matrix | Mechanism), receipt, limits footer." Algorithm/Map/Matrix/Mechanism are
// placeholders (modules 06/07/08 views aren't built) — shown as a disabled/"coming
// soon" state, never silently hidden, per SPEC §11 "abstain = explained state,
// never an empty screen."

const PLACEHOLDER_VIEWS = [
  { value: 'algorithm', label: 'Algorithm' },
  { value: 'map', label: 'Map' },
  { value: 'matrix', label: 'Matrix' },
  { value: 'mechanism', label: 'Mechanism' },
] as const;

export function RunView({ runId }: { runId: string }) {
  const { stages, sourceProgress, claims, receipt, status, errorMessage } = useRunStream(`/api/runs/${runId}/stream`);
  const [selectedClaim, setSelectedClaim] = useState<Claim | null>(null);

  const isStreaming = status === 'streaming';

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 px-6 py-10">
      <header className="flex items-center justify-between">
        <a href="/" className="text-sm text-muted hover:text-fg">
          &larr; New question
        </a>
        <span className="font-mono text-xs text-muted">{runId}</span>
      </header>

      {isStreaming && <StageProgress stages={stages} sourceProgress={sourceProgress} />}

      {errorMessage && (
        <div role="alert" className="rounded-[var(--radius-card)] border border-conflict/40 bg-surface p-4 text-sm text-conflict">
          {errorMessage}
        </div>
      )}

      {!isStreaming && !errorMessage && (
        <p className="text-xs text-muted">
          Run {status === 'done' ? 'complete' : status === 'partial' ? 'finished with gaps' : status}.
        </p>
      )}

      <Tabs.Root defaultValue="evidence" className="flex flex-col gap-4">
        <Tabs.List className="flex gap-1 border-b border-border" aria-label="Views">
          <Tabs.Trigger
            value="evidence"
            className="rounded-t-[var(--radius-chip)] px-3 py-2 text-sm text-muted data-[state=active]:border-b-2 data-[state=active]:border-accent data-[state=active]:text-fg"
          >
            Evidence
          </Tabs.Trigger>
          {PLACEHOLDER_VIEWS.map((view) => (
            <Tabs.Trigger
              key={view.value}
              value={view.value}
              className="rounded-t-[var(--radius-chip)] px-3 py-2 text-sm text-muted data-[state=active]:border-b-2 data-[state=active]:border-accent data-[state=active]:text-fg"
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
          <Tabs.Content key={view.value} value={view.value} className="rounded-[var(--radius-card)] border border-border bg-surface p-6 text-center text-sm text-muted">
            The {view.label} view isn&rsquo;t built yet — the Evidence tab shows what has been verified so far.
          </Tabs.Content>
        ))}
      </Tabs.Root>

      {receipt && (
        <footer className="rounded-[var(--radius-card)] border border-border bg-surface p-4 text-xs text-muted">
          <div className="flex flex-wrap gap-3">
            <Chip>{receipt.claimsTotal} claims checked</Chip>
            <Chip>{receipt.quotesFound} quotes verified</Chip>
            {receipt.retracted > 0 && <Chip tone="conflict">{receipt.retracted} retracted source(s) excluded</Chip>}
            <Chip>{receipt.supported} fully supported (support review not built yet)</Chip>
          </div>
          <p className="mt-2">Generated {new Date(receipt.generatedAt).toLocaleString()}</p>
        </footer>
      )}

      <EvidenceDrawer claim={selectedClaim} onClose={() => setSelectedClaim(null)} />
    </main>
  );
}
