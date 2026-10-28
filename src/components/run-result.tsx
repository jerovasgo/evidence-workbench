'use client';

import { useState } from 'react';
import type { Claim } from '@/shared/domain';
import { ClaimCard } from '@/components/claim-card';
import { EvidenceDrawer } from '@/components/evidence-drawer';
import { EvidenceSkeleton } from '@/components/evidence-skeleton';
import { StageProgress } from '@/components/stage-progress';
import { Chip } from '@/components/ui/chip';
import { useRunStream } from '@/lib/use-run-stream';
import { initialProcessingMessage } from '@/lib/processing-messages';
import { buildResultSummary } from '@/lib/i18n/result-summary';
import type { Mode } from '@/lib/modes';
import type { Intent } from '@/modules/01-orchestrator';

// The live/finished result of one run: an initial processing message + collapsed
// "Research progress" while streaming, then exactly one result — a short, receipt-
// grounded summary followed by the evidence and its sources (2026-10-28
// conversational-flow brief, Etapas B–D). Never a tab switcher with inert
// placeholder tabs ("single mode per query" policy, docs/DECISIONS.md). Evidence is
// the only real output today (modules 06/07/08 — Algorithm/Map/Matrix/Mechanism —
// aren't built); a mode that asked for one of those says so in one line instead of
// showing an empty tab. Shared between the standalone run page
// (src/app/runs/[id]/run-view.tsx) and the dashboard's conversation thread
// (src/components/dashboard/conversation-thread.tsx) — both need the exact same
// SSE-driven rendering, not a re-implementation.

const MODE_LABEL: Partial<Record<Mode, string>> = { algorithm: 'Algorithm', evidence_map: 'Evidence Map' };
const INTENT_LABEL: Partial<Record<Intent, string>> = { algorithm: 'an Algorithm', evidence_map: 'an Evidence Map', mechanism: 'a Mechanism diagram' };

/**
 * An explicit `mode` (the user picked one) always wins — says which unbuilt view was
 * asked for. Otherwise, in Auto, only worth a note when the router's real `intent`
 * (P1) identified something other than plain evidence lookup — `fact_lookup`/
 * `comparison` already IS the Evidence list shown below, nothing to explain.
 */
function unbuiltViewNote(mode: Mode | undefined, intent: Intent | null | undefined): string | null {
  const explicitLabel = mode && mode !== 'auto' ? MODE_LABEL[mode] : undefined;
  if (explicitLabel) return `The ${explicitLabel} view isn’t built yet — showing the verified evidence behind it instead.`;

  const intentLabel = intent ? INTENT_LABEL[intent] : undefined;
  if (intentLabel) return `I identified this as ${intentLabel} question; that view isn’t built yet, so here’s the verified evidence instead.`;

  return null;
}

export function RunResult({ runId, mode, intent }: { runId: string; mode?: Mode; intent?: Intent | null }) {
  const { stages, sourceProgress, claims, sourceScores, receipt, status, errorMessage } = useRunStream(`/api/runs/${runId}/stream`);
  const [selectedClaim, setSelectedClaim] = useState<Claim | null>(null);

  const isStreaming = status === 'streaming';
  const note = unbuiltViewNote(mode, intent);
  const summary = buildResultSummary(status, receipt, claims);

  return (
    <div className="flex flex-col gap-6">
      {isStreaming && (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-fg">{initialProcessingMessage(mode)}</p>
          <StageProgress stages={stages} sourceProgress={sourceProgress} />
        </div>
      )}

      {errorMessage && (
        <div role="alert" className="rounded-[var(--radius-card)] border border-conflict/40 bg-black/40 p-4 text-sm text-conflict">
          {errorMessage}
        </div>
      )}

      {!isStreaming && !errorMessage && summary && <p className="text-sm text-fg">{summary}</p>}

      {note && <p className="text-xs text-muted">{note}</p>}

      <div className="flex flex-col gap-3">
        {claims === null && isStreaming && <EvidenceSkeleton />}
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
      </div>

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
