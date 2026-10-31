'use client';

import { useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import type { Claim } from '@/shared/domain';
import { buildEvidenceMatrix } from '@/modules/07-map-matrix';
import { EvidenceDrawer } from '@/components/evidence-drawer';
import { EvidenceSkeleton } from '@/components/evidence-skeleton';
import { EvidenceLandscape } from '@/components/evidence-landscape';
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
  if (explicitLabel) return `The full ${explicitLabel} view is still in development. The live provenance graph shows the evidence available so far.`;

  const intentLabel = intent ? INTENT_LABEL[intent] : undefined;
  if (intentLabel) return `I identified this as ${intentLabel} question; that view isn’t built yet, so here’s the verified evidence instead.`;

  return null;
}

export function RunResult({ runId, mode, intent, query }: { runId: string; mode?: Mode; intent?: Intent | null; query?: string }) {
  const { opening, geneContext, stages, sourceProgress, sourceCatalog, provisionalBySource, qualifiedBySource, withdrawals, claims, sourceScores, receipt, relations, relationStatus, status, errorMessage } = useRunStream(`/api/runs/${runId}/stream`);
  const [selectedClaim, setSelectedClaim] = useState<Claim | null>(null);

  const isStreaming = status === 'streaming';
  const note = unbuiltViewNote(mode, intent);
  const visibleClaims = claims === null ? null : buildEvidenceMatrix(claims).flatMap((source) => source.claims);
  const provisionalClaims = Object.values(provisionalBySource).flat();
  const qualifiedClaims = Object.values(qualifiedBySource).flat();
  const summary = buildResultSummary(status, receipt, visibleClaims);
  const reducedMotion = useReducedMotion();
  const requestedComparison = intent === 'comparison' || (intent == null && /\b(compare|comparison|contrast|concordance|comparar|comparación|contrastar|concordancia)\b/i.test(query ?? ''));
  const showComparison = requestedComparison || relations.some((relation) => relation.kind === 'contradicts' || relation.divergence?.kind === 'scientific_contradiction');
  const displayClaims = [...provisionalClaims, ...qualifiedClaims, ...(visibleClaims ?? [])];
  const substantiveOpening = visibleClaims?.length
    ? `The verified evidence located so far reports: ${visibleClaims[0]!.text}${visibleClaims.length > 1 ? ` The view below contains ${visibleClaims.length - 1} additional finding${visibleClaims.length === 2 ? '' : 's'} and their source context.` : ''}`
    : provisionalClaims.length
      ? `A retrieved source reports: ${provisionalClaims[0]!.text} This finding is still being checked against its source.`
      : geneContext.length > 0
        ? `Human gene references identify ${geneContext.map((gene) => `${gene.symbol}${gene.name ? ` as ${gene.name}` : ''}`).join(' and ')}. ${opening ?? 'I’m checking the research literature for findings that answer your question.'}`
        : opening;
  const reveal = reducedMotion ? false : { opacity: 0, y: 8 };

  return (
    <div className="flex flex-col gap-5">
      {substantiveOpening ? <motion.div key={visibleClaims?.length ? 'grounded' : provisionalClaims.length ? 'provisional' : 'opening'} initial={reveal} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}>
        <p className="editorial-kicker">OVERVIEW {visibleClaims?.length ? '· SOURCE GROUNDED' : '· PRELIMINARY'}</p>
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

      <motion.div initial={reveal} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
        {Object.keys(sourceCatalog).length > 0 || provisionalClaims.length > 0 || (visibleClaims?.length ?? 0) > 0
          ? <EvidenceLandscape sources={sourceCatalog} provisional={provisionalClaims} qualified={qualifiedClaims} verified={visibleClaims ?? []} onOpenEvidence={setSelectedClaim} />
          : isStreaming && <EvidenceSkeleton />}
      </motion.div>

      <div className="flex flex-col gap-3">
        {visibleClaims !== null && visibleClaims.length === 0 && (
          <p className="text-sm text-muted">
            No claims meet the current verification requirements. Older results may need a new run to check retraction status.
          </p>
        )}
      </div>

      {showComparison && visibleClaims && visibleClaims.length > 1 && <motion.section initial={reveal} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }} aria-label="Evidence relationships" className="research-surface rounded-2xl p-5 sm:p-6">
        <p className="editorial-kicker">CROSS-STUDY READING</p>
        <h3 className="mt-2 text-lg font-light">{relations.some((relation) => relation.kind === 'contradicts') ? 'Where the findings diverge' : 'How the findings compare'}</h3>
        {relations.length ? <ul className="mt-4 divide-y divide-border">{relations.slice(0, 5).map((relation, index) => <li key={`${relation.from}-${relation.to}-${index}`} className="py-3 text-sm leading-6"><span className="mr-2 text-xs uppercase tracking-wide text-muted">{relation.kind.replace(/_/g, ' ')}</span>{relation.evidence}</li>)}</ul> : <p className="mt-3 text-sm leading-6 text-muted">These studies are available in the evidence view above. A supported relationship between their findings has not yet been established.</p>}
        {relationStatus === 'pending' && <p className="mt-3 text-xs text-muted">Assessing relationships across sources…</p>}
      </motion.section>}

      <details className="rounded-[var(--radius-card)] border border-border bg-black/30 p-4 text-xs text-muted">
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

      <EvidenceDrawer claim={selectedClaim} source={selectedClaim ? sourceCatalog[selectedClaim.sourceId] : undefined} sourceScore={selectedClaim ? (sourceScores?.[selectedClaim.sourceId] ?? null) : null} onClose={() => setSelectedClaim(null)} />
    </div>
  );
}
