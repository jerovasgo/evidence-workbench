'use client';

import { Info } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import type { Claim } from '@/shared/domain';

type SourceEntry = { id: string; title: string; url: string; year?: number };

/** Evidence is rendered once. Every finding has a contextual path to its quotation. */
export function EvidenceLandscape({ sources, provisional, qualified, verified, onOpenEvidence }: {
  sources: Record<string, SourceEntry>;
  provisional: Claim[];
  qualified: Claim[];
  verified: Claim[];
  onOpenEvidence: (claim: Claim) => void;
}) {
  const reducedMotion = useReducedMotion();
  const findings = [
    ...verified.map((claim) => ({ claim, state: 'verified' as const })),
    ...qualified.map((claim) => ({ claim, state: 'partial' as const })),
    ...provisional.filter((claim) => !verified.some((item) => item.id === claim.id) && !qualified.some((item) => item.id === claim.id)).map((claim) => ({ claim, state: 'reviewing' as const })),
  ];
  const sourceCount = new Set(findings.map(({ claim }) => claim.sourceId)).size;
  const candidateCount = Object.values(sources).filter((source) => !findings.some(({ claim }) => claim.sourceId === source.id)).length;

  return <section aria-label="Evidence visualization" className="research-surface overflow-hidden rounded-2xl p-5 sm:p-7">
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border pb-5">
      <div>
        <p className="editorial-kicker">EVIDENCE / LIVE VIEW</p>
        <h3 className="mt-2 text-xl font-light tracking-tight text-fg">What the sources report</h3>
      </div>
      <p className="text-xs text-muted">{findings.length ? `${findings.length} findings · ${sourceCount} sources` : candidateCount ? `${candidateCount} sources being assessed` : 'Searching the literature'}</p>
    </div>

    {findings.length ? <div className="mt-3 divide-y divide-border" aria-live="polite">
      {findings.map(({ claim, state }, index) => {
        const source = sources[claim.sourceId];
        return <motion.div key={claim.id} initial={reducedMotion ? false : { opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .3, delay: Math.min(index * .05, .25) }} className="grid gap-3 py-5 sm:grid-cols-[28px_minmax(0,1fr)]">
          <span aria-hidden="true" className="pt-0.5 font-mono text-xs text-muted-2">{String(index + 1).padStart(2, '0')}</span>
          <div className="min-w-0">
            <div className="flex items-start gap-3">
              <p className="min-w-0 flex-1 text-[15px] font-light leading-7 text-fg">{claim.text}</p>
              <button type="button" onClick={() => onOpenEvidence(claim)} title={`Inspect source and original quotation: ${source?.title ?? claim.sourceId}`} aria-label={`Inspect source and original quotation for finding ${index + 1}`} className="evidence-info grid size-8 shrink-0 place-items-center rounded-full border border-border text-muted transition-colors hover:border-border-strong hover:text-fg"><Info size={15} aria-hidden="true" /></button>
            </div>
            <p className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted"><span className="inline-block size-1.5 rounded-full bg-current" aria-hidden="true" />{state === 'verified' ? 'Verified against source text' : state === 'partial' ? `Partially supported${claim.verification.supportNote ? ` · ${claim.verification.supportNote}` : ''}` : 'Source checks in progress'}<span aria-hidden="true">·</span><span className="max-w-full truncate">{source?.title ?? claim.sourceId}{source?.year ? `, ${source.year}` : ''}</span></p>
          </div>
        </motion.div>;
      })}
    </div> : <div className="py-9">
      <div className="evidence-loading-path mx-auto h-px w-3/4 bg-white/30" aria-hidden="true" />
      <p className="mt-5 text-center text-sm font-light text-muted">Findings will appear here as their sources are assessed.</p>
    </div>}

  </section>;
}
