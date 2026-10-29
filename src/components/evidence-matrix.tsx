'use client';

import type { Claim, GeneticContext } from '@/shared/domain';
import { buildEvidenceMatrix } from '@/modules/07-map-matrix';

const FIELDS: [keyof GeneticContext, string][] = [
  ['gene', 'Gene / entity'], ['organism', 'Organism'], ['model', 'Experimental model'],
  ['perturbation', 'Perturbation'], ['measurement', 'Measurement'], ['effect', 'Reported effect'],
];

export function EvidenceMatrix({ claims, onOpenEvidence }: { claims: Claim[]; onOpenEvidence: (claim: Claim) => void }) {
  const sources = buildEvidenceMatrix(claims);
  if (!sources.length) return null;
  return <section className="rounded-[var(--radius-card)] border border-border p-4" aria-label="Evidence matrix">
    <h3 className="text-sm font-semibold">Evidence matrix</h3>
    <p className="mt-2 text-xs leading-relaxed text-muted">Compare source findings and quoted experimental context. Missing context is unknown; placement does not imply agreement or contradiction.</p>
    <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[640px] border-collapse text-left text-xs">
      <caption className="sr-only">Findings grouped by source with experimental context</caption>
      <thead><tr><th scope="col" className="border-b border-border p-3 text-muted">Evidence</th>{sources.map((source) => <th scope="col" key={source.sourceId} className="min-w-52 border-b border-border p-3 font-medium">{source.sourceId}</th>)}</tr></thead>
      <tbody>
        <tr><th scope="row" className="border-b border-border p-3 align-top text-muted">Findings</th>{sources.map((source) => <td key={source.sourceId} className="border-b border-border p-3 align-top"><ul className="space-y-3">{source.claims.map((claim) => <li key={claim.id}><button type="button" onClick={() => onOpenEvidence(claim)} className="text-left leading-relaxed text-fg underline decoration-border-strong underline-offset-4 hover:decoration-fg">{claim.text}</button></li>)}</ul></td>)}</tr>
        {FIELDS.map(([key, label]) => <tr key={key}><th scope="row" className="border-b border-border p-3 align-top font-normal text-muted">{label}</th>{sources.map((source) => <td key={source.sourceId} className="border-b border-border p-3 align-top text-fg">{source.claims.map((claim) => <div key={claim.id} className="mb-2">{claim.geneticContext?.[key] || <span className="text-muted">Not stated in quote</span>}</div>)}</td>)}</tr>)}
      </tbody>
    </table></div>
  </section>;
}
