'use client';

import type { Claim, GeneticContext, Relation } from '@/shared/domain';
import { buildEvidenceMatrix } from '@/modules/07-map-matrix';

const FIELDS: [keyof GeneticContext, string][] = [
  ['gene', 'Gene / entity'], ['organism', 'Organism'], ['model', 'Experimental model'],
  ['perturbation', 'Perturbation'], ['measurement', 'Measurement'], ['effect', 'Reported effect'],
];

export function EvidenceMatrix({ claims, sourceCatalog = {}, questions, relations, relationStatus, onOpenEvidence }: {
  sourceCatalog?: Record<string, { title: string; url: string }>;
  claims: Claim[]; questions: string[]; relations: Relation[]; relationStatus: 'pending' | 'ok' | 'partial' | 'failed'; onOpenEvidence: (claim: Claim) => void;
}) {
  const sources = buildEvidenceMatrix(claims);
  const reference = (claim: Claim) => `[${claims.findIndex((item) => item.id === claim.id) + 1}]`;
  if (!sources.length) return null;
  return <section className="rounded-[var(--radius-card)] border border-border p-4" aria-label="Evidence matrix">
    <h3 className="text-sm font-semibold">Evidence comparison and concordance</h3>
    <p className="mt-2 text-xs leading-relaxed text-muted">Compare source findings and quoted experimental context. Missing context is unknown; placement does not imply agreement or contradiction.</p>
    <div className="mt-5 space-y-4" aria-live="polite">
      {relationStatus === 'pending' && <p className="text-xs text-muted">Comparing claims across sources…</p>}
      {relationStatus === 'failed' && <p className="text-xs text-warning">Concordance could not be assessed. Source findings remain available below.</p>}
      {relationStatus === 'partial' && <p className="text-xs text-warning">Some comparisons could not be assessed.</p>}
      {questions.map((question, index) => {
        const questionClaims = claims.filter((claim) => claim.subQuestionIndex === index);
        const questionIds = new Set(questionClaims.map((claim) => claim.id));
        const pairs = relations.filter((relation) => questionIds.has(relation.from) && questionIds.has(relation.to));
        if (!questionClaims.length) return null;
        return <div key={`${index}-${question}`} className="rounded-lg border border-border p-3"><h4 className="text-sm font-medium">{question}</h4>
          {pairs.length === 0 && <p className="mt-2 text-xs text-muted">No assessed relationship available for this question.</p>}
          <ul className="mt-2 space-y-3">{pairs.map((relation, i) => {
            const a = questionClaims.find((claim) => claim.id === relation.from);
            const b = questionClaims.find((claim) => claim.id === relation.to);
            if (!a || !b) return null;
            const label = relation.kind === 'agrees' ? 'Possible agreement' : relation.kind === 'contradicts' ? 'Possible contradiction' : 'Difference / context';
            const context = relation.contextAssessment;
            return <li key={`${relation.from}-${relation.to}-${i}`} className="text-xs leading-relaxed"><span className="font-semibold text-fg">{label}</span><p className="mt-1 text-muted">{relation.evidence}</p>{context?.status === 'review_needed' && <div className="mt-2 rounded border border-warning/40 p-2 text-warning"><p>Context requires review. Different wording may represent a synonym or a genuine experimental difference.</p>{context.different.length > 0 && <p>Different wording: {context.different.map((key) => { const field = key as keyof GeneticContext; return `${key} (${reference(a)}: ${a.geneticContext?.[field]}; ${reference(b)}: ${b.geneticContext?.[field]})`; }).join('; ')}</p>}{context.missing.length > 0 && <p>Missing in one or both quotes: {context.missing.join(', ')}</p>}</div>}<div className="mt-1 flex flex-wrap gap-2"><button className="underline underline-offset-4" type="button" onClick={() => onOpenEvidence(a)}>{reference(a)} {a.text}</button><button className="underline underline-offset-4" type="button" onClick={() => onOpenEvidence(b)}>{reference(b)} {b.text}</button></div></li>;
          })}</ul>
        </div>;
      })}
      {relationStatus !== 'pending' && !questions.some((_, i) => claims.some((claim) => claim.subQuestionIndex === i)) && <p className="text-xs text-muted">No findings have an assigned research question. No concordance can be inferred.</p>}
      <p className="text-xs text-muted">Relations are tentative AI assessments, not verified facts. Review the quotations and flagged context before drawing conclusions.</p>
    </div>
    <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[640px] border-collapse text-left text-xs">
      <caption className="sr-only">Findings grouped by source with experimental context</caption>
      <thead><tr><th scope="col" className="border-b border-border p-3 text-muted">Evidence</th>{sources.map((source) => <th scope="col" key={source.sourceId} className="min-w-52 border-b border-border p-3 font-medium">{sourceCatalog[source.sourceId]?.title ?? source.sourceId}</th>)}</tr></thead>
      <tbody>
        <tr><th scope="row" className="border-b border-border p-3 align-top text-muted">Findings</th>{sources.map((source) => <td key={source.sourceId} className="border-b border-border p-3 align-top"><ul className="space-y-3">{source.claims.map((claim) => <li key={claim.id}><button type="button" onClick={() => onOpenEvidence(claim)} className="text-left leading-relaxed text-fg underline decoration-border-strong underline-offset-4 hover:decoration-fg">{reference(claim)} {claim.text}</button></li>)}</ul></td>)}</tr>
        {FIELDS.filter(([key]) => claims.some((claim) => claim.geneticContext?.[key])).map(([key, label]) => <tr key={key}><th scope="row" className="border-b border-border p-3 align-top font-normal text-muted">{label}</th>{sources.map((source) => <td key={source.sourceId} className="border-b border-border p-3 align-top text-fg">{source.claims.map((claim) => <div key={claim.id} className="mb-2">{claim.geneticContext?.[key] || <span className="text-muted">Not stated in quote</span>}</div>)}</td>)}</tr>)}
      </tbody>
    </table></div>
  </section>;
}
