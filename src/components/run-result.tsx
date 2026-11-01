'use client';

import { isComparisonRequest } from '@/lib/research-intent';
import * as Tabs from '@radix-ui/react-tabs';
import { useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import type { Claim } from '@/shared/domain';
import { buildEvidenceMatrix } from '@/modules/07-map-matrix';
import { ReviewAuditPanel } from '@/components/review-audit';
import { EvidenceDrawer } from '@/components/evidence-drawer';
import { EvidenceSkeleton } from '@/components/evidence-skeleton';
import { EvidenceMatrix } from '@/components/evidence-matrix';
import { EvidenceLandscape } from '@/components/evidence-landscape';
import { AlgorithmView } from '@/components/algorithm-view';
import { MechanismView } from '@/components/mechanism-view';
import { StageProgress } from '@/components/stage-progress';
import { Chip } from '@/components/ui/chip';
import { useRunStream } from '@/lib/use-run-stream';
import { buildResultSummary } from '@/lib/i18n/result-summary';
import type { Mode } from '@/lib/modes';
import type { Intent } from '@/modules/01-orchestrator';

// The live/finished result of one run: an initial processing message + collapsed
// "Research progress" while streaming, then exactly one result — a short, receipt-
// grounded summary followed by the evidence and its sources (2026-10-28
// conversational-flow brief, Etapas B–D). Never a tab switcher with inert
// placeholder tabs ("single mode per query" policy, docs/DECISIONS.md). Evidence,
// Algorithm (module 06) and Mechanism (module 08) are real; the radial Evidence Map
// (module 07's map half) isn't built yet — a mode that asked for that one says so in
// one line instead of showing an empty tab. Shared between the standalone run page
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
/**
 * Prefers one claim per distinct source before a second claim from any
 * already-represented source, so a short "Key findings" list actually spans the
 * evidence (the "development" beat of the narrative) instead of risking all 3 slots
 * going to the same single source just because it happened to stream in first.
 */
function selectDiverseFindings(claims: Claim[], limit: number): Claim[] {
  const seenSources = new Set<string>();
  const picked: Claim[] = [];
  const leftover: Claim[] = [];
  for (const claim of claims) {
    if (picked.length >= limit) break;
    if (seenSources.has(claim.sourceId)) {
      leftover.push(claim);
    } else {
      seenSources.add(claim.sourceId);
      picked.push(claim);
    }
  }
  for (const claim of leftover) {
    if (picked.length >= limit) break;
    picked.push(claim);
  }
  return picked;
}

/**
 * "Select the format the data actually supports" (2026-10-31, docs/DECISIONS.md):
 * true when at least one sub-question has verified claims from ≥2 distinct sources —
 * genuinely comparable evidence — regardless of whether the request was phrased as
 * a literal comparison. Pure client-side check over data already streamed, no new
 * model call or SSE event.
 */
function hasComparableEvidence(claims: Claim[]): boolean {
  const sourcesBySubQuestion = new Map<number, Set<string>>();
  for (const claim of claims) {
    if (claim.subQuestionIndex === undefined) continue;
    const sources = sourcesBySubQuestion.get(claim.subQuestionIndex) ?? new Set<string>();
    sources.add(claim.sourceId);
    sourcesBySubQuestion.set(claim.subQuestionIndex, sources);
  }
  return [...sourcesBySubQuestion.values()].some((sources) => sources.size >= 2);
}

function unbuiltViewNote(mode: Mode | undefined, intent: Intent | null | undefined): string | null {
  const explicitLabel = mode && mode !== 'auto' ? MODE_LABEL[mode] : undefined;
  if (explicitLabel) return `The full ${explicitLabel} view is still in development. The live provenance graph shows the evidence available so far.`;

  const intentLabel = intent ? INTENT_LABEL[intent] : undefined;
  if (intentLabel) return `I identified this as ${intentLabel} question; that view isn’t built yet, so here’s the verified evidence instead.`;

  return null;
}

export function RunResult({ runId, mode, intent, query }: { runId: string; mode?: Mode; intent?: Intent | null; query?: string }) {
  const { opening, geneContext, stages, sourceProgress, sourceCatalog, provisionalBySource, qualifiedBySource, withdrawals, claims, sourceScores, algorithm, algorithmStatus, algorithmAbstainReason, mechanism, mechanismStatus, mechanismAbstainReason, receipt, relations, questions, relationStatus, status, errorMessage } = useRunStream(`/api/runs/${runId}/stream`);
  const [selectedClaim, setSelectedClaim] = useState<Claim | null>(null);

  const isStreaming = status === 'streaming';
  // Module 06/08 V1 (docs/DECISIONS.md): the algorithm and mechanism views replace
  // the generic "not built yet" note for these two intents — both are built now.
  // Evidence Map keeps the placeholder note untouched (module 07's map half still
  // has no renderer).
  const isAlgorithmRequested = mode === 'algorithm' || ((mode === undefined || mode === 'auto') && intent === 'algorithm');
  const isMechanismRequested = mode === 'mechanism' || ((mode === undefined || mode === 'auto') && intent === 'mechanism');
  const note = isAlgorithmRequested || isMechanismRequested ? null : unbuiltViewNote(mode, intent);
  const visibleClaims = claims === null ? null : buildEvidenceMatrix(claims).flatMap((source) => source.claims);
  const provisionalClaims = Object.values(provisionalBySource).flat();
  const qualifiedClaims = Object.values(qualifiedBySource).flat();
  const summary = buildResultSummary(status, receipt, visibleClaims);
  const reducedMotion = useReducedMotion();
  const requestedComparison = intent === 'comparison' || isComparisonRequest(query ?? '');
  const showComparison = requestedComparison
    || relations.some((relation) => relation.kind === 'contradicts' || relation.divergence?.kind === 'scientific_contradiction')
    || hasComparableEvidence(visibleClaims ?? []);
  const displayClaims = [...provisionalClaims, ...qualifiedClaims, ...(visibleClaims ?? [])];
  const substantiveOpening = opening;
  const reveal = reducedMotion ? false : { opacity: 0, y: 8 };

  return (
    <Tabs.Root defaultValue="main" className="flex flex-col gap-5">
      <Tabs.List aria-label="Research results" className="flex gap-4 border-b border-border pb-3">
        <Tabs.Trigger value="main" className="text-sm text-muted data-[state=active]:text-fg focus-visible:outline focus-visible:outline-2">Main Answer</Tabs.Trigger>
        <Tabs.Trigger value="evidence" className="text-sm text-muted data-[state=active]:text-fg focus-visible:outline focus-visible:outline-2">Evidence &amp; Sources</Tabs.Trigger>
      </Tabs.List>
      <Tabs.Content value="main" className="space-y-5">
      {substantiveOpening ? <motion.div key="overview" initial={reveal} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}>
        <p className="editorial-kicker">OVERVIEW</p>
        <p className="mt-3 max-w-2xl text-[16px] font-light leading-7 text-fg">{substantiveOpening}</p>
      </motion.div> : isStreaming && <div role="status" aria-label="Preparing overview" className="space-y-2 animate-pulse">
        <div className="h-3 w-4/5 rounded bg-border" /><div className="h-3 w-3/5 rounded bg-border" />
      </div>}

      {geneContext.length > 0 && <div className="flex flex-wrap gap-3 text-xs text-muted" aria-label="Gene reference context">
        {geneContext.map((gene) => <span key={gene.symbol}>{gene.symbol}{gene.name ? ` · ${gene.name}` : ''} <span className="mx-1">·</span>{gene.links.map((link, index) => <span key={link.label}>{index > 0 ? ' / ' : ''}<a className="underline underline-offset-4 hover:text-fg" href={link.url} target="_blank" rel="noopener noreferrer">{link.label}</a></span>)}</span>)}
      </div>}

      {(isStreaming || relationStatus === 'pending') && (
        <StageProgress stages={stages} sourceProgress={sourceProgress} />
      )}

      {errorMessage && (
        <div role="alert" className="rounded-[var(--radius-card)] border border-conflict/40 bg-black/40 p-4 text-sm text-conflict">
          {errorMessage}
        </div>
      )}

      {note && <p className="text-xs text-muted">{note}</p>}

      {isAlgorithmRequested && algorithmStatus !== 'pending' && (
        <AlgorithmView
          graph={algorithm?.graph ?? null}
          band={algorithm?.band ?? null}
          claims={visibleClaims ?? []}
          onOpenEvidence={setSelectedClaim}
          abstainReason={algorithmStatus === 'abstained' ? algorithmAbstainReason : null}
        />
      )}

      {isMechanismRequested && mechanismStatus !== 'pending' && (
        <MechanismView
          graph={mechanism?.graph ?? null}
          claims={visibleClaims ?? []}
          onOpenEvidence={setSelectedClaim}
          abstainReason={mechanismStatus === 'abstained' ? mechanismAbstainReason : null}
        />
      )}

      {visibleClaims && visibleClaims.length > 0 && <ul className="space-y-3" aria-label="Key findings">{selectDiverseFindings(visibleClaims.filter((claim) => claim.actionType !== 'method'), 3).map((claim) => <li key={claim.id}><button type="button" onClick={() => setSelectedClaim(claim)} className="text-left text-sm leading-6 underline decoration-border underline-offset-4">{claim.text}</button></li>)}</ul>}
      {showComparison && relations.length > 0 && <p className="text-sm leading-6 text-muted">{relations[0]?.evidence}</p>}
      <div className="flex flex-col gap-3">
        {visibleClaims !== null && visibleClaims.length === 0 && (
          <p className="text-sm text-muted">
            The detailed verification did not retain a source-level claim for this run. The overview may still provide a qualified synthesis from the retrieved literature; inspect Evidence &amp; Sources to see what was reviewed and why findings were excluded.
          </p>
        )}
      </div>

      </Tabs.Content>
      <Tabs.Content value="evidence" className="space-y-5">
      <ReviewAuditPanel runId={runId} complete={!isStreaming} sources={sourceCatalog} />
      <details className="research-surface rounded-2xl p-4"><summary className="cursor-pointer text-sm">What the sources report</summary>
      <motion.div initial={reveal} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
        {Object.keys(sourceCatalog).length > 0 || provisionalClaims.length > 0 || (visibleClaims?.length ?? 0) > 0
          ? <EvidenceLandscape sources={sourceCatalog} provisional={provisionalClaims} qualified={qualifiedClaims} verified={visibleClaims ?? []} onOpenEvidence={setSelectedClaim} />
          : isStreaming && <EvidenceSkeleton />}
      </motion.div></details>

      {showComparison && visibleClaims && new Set(visibleClaims.map((claim) => claim.sourceId)).size >= 2 && <EvidenceMatrix claims={visibleClaims} sourceCatalog={sourceCatalog} questions={questions} relations={relations} relationStatus={relationStatus} onOpenEvidence={setSelectedClaim} />}

      <details open className="rounded-[var(--radius-card)] border border-border bg-black/30 p-4 text-xs text-muted">
        <summary className="cursor-pointer text-sm text-fg">Sources, quotations and verification details</summary>
        {summary && <p className="mt-4">{summary}</p>}
        {Object.keys(sourceCatalog).length > 0 && <ul className="mt-4 space-y-2">{Object.values(sourceCatalog).map((source) => <li key={source.id}><a className="underline underline-offset-4" href={source.url} target="_blank" rel="noopener noreferrer">{source.title}</a>{source.year ? ` (${source.year})` : ''}</li>)}</ul>}
        {withdrawals.length > 0 && <div aria-live="polite" className="mt-4 space-y-1 text-warning">{withdrawals.map((entry, index) => <p key={`${entry.sourceId}-${index}`}>{entry.count} extracted {entry.count === 1 ? 'claim was' : 'claims were'} removed after verification ({sourceCatalog[entry.sourceId]?.title ?? entry.sourceId}). {entry.reason}</p>)}</div>}
        {displayClaims.length > 0 && <p className="mt-4">Use the information buttons beside findings to inspect quotations, study identifiers and verification status.</p>}
        {receipt && <footer className="mt-4 border-t border-border pt-3">
          <div className="flex flex-wrap gap-3">
            <Chip>{receipt.claimsTotal} claims checked</Chip>
            <Chip>{receipt.quotesFound} quotes verified</Chip>
            {receipt.retracted > 0 && <Chip tone="conflict">{receipt.retracted} retracted source(s) excluded</Chip>}
            <Chip>{receipt.supported} fully supported by support-judge</Chip>
            {(receipt.partial ?? 0) > 0 && <Chip>{receipt.partial} partially supported, shown with caveats</Chip>}
          </div>
          {receipt.dropReasons && Object.keys(receipt.dropReasons).length > 0 && <p className="mt-2">Removed after checks: {Object.entries(receipt.dropReasons).map(([reason, count]) => `${count} ${reason}`).join(' · ')}</p>}
          <p className="mt-2">Generated {new Date(receipt.generatedAt).toLocaleString()}</p>
        </footer>}
      </details>

      </Tabs.Content>
      <EvidenceDrawer claim={selectedClaim} source={selectedClaim ? sourceCatalog[selectedClaim.sourceId] : undefined} sourceScore={selectedClaim ? (sourceScores?.[selectedClaim.sourceId] ?? null) : null} onClose={() => setSelectedClaim(null)} />
    </Tabs.Root>
  );
}
