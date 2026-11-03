'use client';

import { isComparisonRequest } from '@/lib/research-intent';
import * as Tabs from '@radix-ui/react-tabs';
import { useEffect, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import type { Claim } from '@/shared/domain';
import { buildEvidenceMatrix } from '@/modules/07-map-matrix';
import { ReviewAuditPanel } from '@/components/review-audit';
import { EvidenceDrawer } from '@/components/evidence-drawer';
import { InitialResearchStatus } from '@/components/initial-research-status';
import { GeneticEntityText } from '@/components/genetic-entity-text';
import { DnaLoader } from '@/components/dna-loader';
import { EvidenceMatrix } from '@/components/evidence-matrix';
import { EvidenceLandscape } from '@/components/evidence-landscape';
import { AlgorithmView } from '@/components/algorithm-view';
import { MechanismView } from '@/components/mechanism-view';
import { EvidenceMapView } from '@/components/evidence-map-view';
import { StageProgress } from '@/components/stage-progress';
import { CitationExportButtons } from '@/components/citation-export-buttons';
import { AccordionSection } from '@/components/accordion-section';
import { SourceRegistryList, SourceRegistrySummaryBar } from '@/components/source-registry';
import { Chip } from '@/components/ui/chip';
import { useRunStream } from '@/lib/use-run-stream';
import { buildResultSummary } from '@/lib/i18n/result-summary';
import { computeSourceRegistry } from '@/lib/source-status';
import type { Mode } from '@/lib/modes';
import type { Intent } from '@/modules/01-orchestrator';
import type { TurnMemorySnapshot } from '@/lib/use-conversations';

// The live/finished result of one run: an initial processing message + collapsed
// "Research progress" while streaming, then exactly one result — a short, receipt-
// grounded summary followed by the evidence and its sources (2026-10-28
// conversational-flow brief, Etapas B–D). Never a tab switcher with inert
// placeholder tabs ("single mode per query" policy, docs/DECISIONS.md). Evidence,
// Algorithm (module 06), Mechanism (module 08) and the Evidence Map (module 07's map
// half) are all real now. Shared between the standalone run page
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

export function RunResult({ runId, mode, intent, query, onMemoryUpdate }: { runId: string; mode?: Mode; intent?: Intent | null; query?: string; onMemoryUpdate?: (snapshot: TurnMemorySnapshot) => void }) {
  const { opening, openingSections, geneContext, stages, sourceProgress, sourceCatalog, provisionalBySource, qualifiedBySource, withdrawals, claims, sourceScores, algorithm, algorithmStatus, algorithmAbstainReason, mechanism, mechanismStatus, mechanismAbstainReason, receipt, relations, questions, relationStatus, status, errorMessage } = useRunStream(`/api/runs/${runId}/stream`);
  const [selectedClaim, setSelectedClaim] = useState<Claim | null>(null);

  const isStreaming = status === 'streaming';
  // Modules 06/07/08 V1 (docs/DECISIONS.md): Algorithm, Mechanism and the Evidence
  // Map each replace the generic "not built yet" note for their own intent — all
  // three are built now, so `unbuiltViewNote` never fires for any of them (it stays
  // in place only as a safety net for a future, genuinely-unbuilt view).
  const isAlgorithmRequested = mode === 'algorithm' || ((mode === undefined || mode === 'auto') && intent === 'algorithm');
  const isMechanismRequested = mode === 'mechanism' || ((mode === undefined || mode === 'auto') && intent === 'mechanism');
  const isEvidenceMapRequested = mode === 'evidence_map' || ((mode === undefined || mode === 'auto') && intent === 'evidence_map');
  const note = isAlgorithmRequested || isMechanismRequested || isEvidenceMapRequested ? null : unbuiltViewNote(mode, intent);
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
  const citableSourceIds = new Set((visibleClaims ?? []).map((claim) => claim.sourceId));
  const citableSources = Object.values(sourceCatalog).filter((source) => citableSourceIds.has(source.id));
  const sourceRegistry = computeSourceRegistry(sourceCatalog, sourceProgress, visibleClaims ?? [], withdrawals, provisionalBySource, isStreaming);
  const substantiveOpening = opening;
  const reveal = reducedMotion ? false : { opacity: 0, y: 8 };
  const claimsById = new Map((visibleClaims ?? []).map((claim) => [claim.id, claim] as const));
  // The fixed "Key findings" bullet list is a fallback for when the final,
  // sectioned overview isn't available yet (still streaming) or abstained —
  // once real model-chosen sections exist, they supersede it rather than
  // duplicating the same evidence in two places.
  const hasOpeningSections = (openingSections?.length ?? 0) > 0;

  useEffect(() => {
    if (!onMemoryUpdate || (!opening && !claims?.length)) return;
    const selectedClaims = selectDiverseFindings(claims ?? [], 4);
    const sourceIds = [...new Set(selectedClaims.map((claim) => claim.sourceId))].slice(0, 4);
    onMemoryUpdate({
      overview: opening ?? undefined,
      findings: selectedClaims.map((claim) => ({
        id: claim.id,
        text: claim.text.slice(0, 360),
        sourceTitle: sourceCatalog[claim.sourceId]?.title.slice(0, 220),
      })),
      sources: sourceIds.flatMap((sourceId) => {
        const source = sourceCatalog[sourceId];
        return source ? [{ id: source.id, title: source.title.slice(0, 220), year: source.year }] : [];
      }),
      visualization: {
        kind: isAlgorithmRequested ? 'algorithm' : isMechanismRequested ? 'mechanism' : isEvidenceMapRequested ? 'evidence_map' : showComparison ? 'comparison' : 'evidence',
        summary: `${selectedClaims.length} key finding${selectedClaims.length === 1 ? '' : 's'} represented for this answer.`,
      },
    });
  }, [claims, isAlgorithmRequested, isEvidenceMapRequested, isMechanismRequested, onMemoryUpdate, opening, showComparison, sourceCatalog]);

  return (
    <Tabs.Root defaultValue="main" className="flex flex-col gap-5">
      <Tabs.List aria-label="Research results" className="flex gap-4 border-b border-border pb-3">
        <Tabs.Trigger value="main" className="text-sm text-muted data-[state=active]:text-fg focus-visible:outline focus-visible:outline-2">Main Answer</Tabs.Trigger>
        <Tabs.Trigger value="evidence" className="text-sm text-muted data-[state=active]:text-fg focus-visible:outline focus-visible:outline-2">Evidence &amp; Sources</Tabs.Trigger>
      </Tabs.List>
      <Tabs.Content value="main" className="space-y-5">
      {substantiveOpening ? <motion.div key="overview" initial={reveal} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}>
        <p className="editorial-kicker">OVERVIEW</p>
        <p className="mt-3 max-w-2xl text-[16px] font-light leading-7 text-fg"><GeneticEntityText text={substantiveOpening} entities={geneContext} /></p>
      </motion.div> : isStreaming && <InitialResearchStatus query={query ?? ''} mode={mode} />}

      {hasOpeningSections && openingSections!.map((section, index) => (
        <motion.div key={`${section.heading}-${index}`} initial={reveal} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, delay: 0.05 * (index + 1) }}>
          <p className="editorial-kicker">{section.heading.toUpperCase()}</p>
          <p className="mt-3 max-w-2xl text-[15px] font-light leading-7 text-fg"><GeneticEntityText text={section.body} entities={geneContext} /></p>
          {section.claimIds.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5" aria-label="Supporting evidence for this section">
              {section.claimIds.map((claimId, claimIndex) => {
                const claim = claimsById.get(claimId);
                if (!claim) return null;
                return (
                  <button
                    key={claimId}
                    type="button"
                    onClick={() => setSelectedClaim(claim)}
                    aria-label={`Open evidence ${claimIndex + 1}: ${claim.text}`}
                    className="rounded-[var(--radius-pill)] border border-border px-2 py-0.5 text-[11px] text-muted hover:border-fg hover:text-fg"
                  >
                    {claimIndex + 1}
                  </button>
                );
              })}
            </div>
          )}
        </motion.div>
      ))}

      {geneContext.length > 0 && <div className="flex flex-wrap gap-3 text-xs text-muted" aria-label="Gene reference context">
        {geneContext.map((gene) => <span key={gene.symbol}>{gene.symbol}{gene.name ? ` · ${gene.name}` : ''} <span className="mx-1">·</span>{gene.links.map((link, index) => <span key={link.label}>{index > 0 ? ' / ' : ''}<a className="underline underline-offset-4 hover:text-fg" href={link.url} target="_blank" rel="noopener noreferrer">{link.label}</a></span>)}</span>)}
      </div>}

      {(isStreaming || relationStatus === 'pending') && (
        <StageProgress stages={stages} sourceProgress={sourceProgress} sourceCatalog={sourceCatalog} isStreaming={isStreaming} />
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

      {isEvidenceMapRequested && (
        <EvidenceMapView
          claims={visibleClaims ?? []}
          questions={questions}
          query={query ?? ''}
          onOpenEvidence={setSelectedClaim}
        />
      )}

      {!hasOpeningSections && visibleClaims && visibleClaims.length > 0 && <ul className="space-y-3" aria-label="Key findings">{selectDiverseFindings(visibleClaims.filter((claim) => claim.actionType !== 'method'), 3).map((claim) => <li key={claim.id}><button type="button" onClick={() => setSelectedClaim(claim)} className="text-left text-sm leading-6 underline decoration-border underline-offset-4">{claim.text}</button></li>)}</ul>}
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
      <SourceRegistrySummaryBar summary={sourceRegistry.summary} />
      <ReviewAuditPanel runId={runId} complete={!isStreaming} sources={sourceCatalog} />
      <AccordionSection title="What the sources report" description="Every finding found so far, grouped by how confidently it's been verified.">
      <motion.div initial={reveal} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
        {Object.keys(sourceCatalog).length > 0 || provisionalClaims.length > 0 || (visibleClaims?.length ?? 0) > 0
          ? <EvidenceLandscape sources={sourceCatalog} provisional={provisionalClaims} qualified={qualifiedClaims} verified={visibleClaims ?? []} onOpenEvidence={setSelectedClaim} />
          : isStreaming && <DnaLoader size="compact" caption="Building the evidence view as sources arrive…" />}
      </motion.div></AccordionSection>

      {showComparison && visibleClaims && new Set(visibleClaims.map((claim) => claim.sourceId)).size >= 2 && <EvidenceMatrix claims={visibleClaims} sourceCatalog={sourceCatalog} questions={questions} relations={relations} relationStatus={relationStatus} onOpenEvidence={setSelectedClaim} />}

      <AccordionSection title="Sources, quotations & verification details" description="Every source identified for this run, its verification status, and why a source was or wasn't used.">
        <div className="text-xs text-muted">
        {summary && <p>{summary}</p>}
        <div className="mt-4"><SourceRegistryList entries={sourceRegistry.entries} /></div>
        <CitationExportButtons sources={citableSources} />
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
        </div>
      </AccordionSection>

      </Tabs.Content>
      <EvidenceDrawer claim={selectedClaim} source={selectedClaim ? sourceCatalog[selectedClaim.sourceId] : undefined} sourceScore={selectedClaim ? (sourceScores?.[selectedClaim.sourceId] ?? null) : null} onClose={() => setSelectedClaim(null)} />
    </Tabs.Root>
  );
}
