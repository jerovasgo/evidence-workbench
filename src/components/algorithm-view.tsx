'use client';

import type { Claim } from '@/shared/domain';
import { findStartNodeId, flattenAlgorithmGraph, type AlgorithmGraph, type AlgorithmNode } from '@/modules/06-algorithm';
import { Chip } from '@/components/ui/chip';

// Module 06 V1 renderer (docs/DECISIONS.md "V1 scope decisions"): a deterministic
// vertical step list computed from `flattenAlgorithmGraph`/`findStartNodeId`
// (`@/modules/06-algorithm`), not a 2D graph canvas — mirrors `evidence-matrix.tsx`'s
// shape (plain markup driven by a pure, tested transform, every claim reference
// opens the same evidence drawer as every other view).

const NODE_LABEL: Record<AlgorithmNode['type'], string> = {
  critical_check: 'Critical check',
  assess: 'Assess',
  method: 'Method',
  decision: 'Decision',
  action: 'Action',
  outcome: 'Outcome',
  iterate: 'Iterate',
  abstain: 'Abstain',
};

function chipTone(type: AlgorithmNode['type']): 'default' | 'warning' | 'conflict' {
  if (type === 'critical_check') return 'warning';
  if (type === 'abstain') return 'conflict';
  return 'default';
}

export function AlgorithmView({
  graph,
  band,
  claims,
  onOpenEvidence,
  abstainReason,
}: {
  graph: AlgorithmGraph | null;
  band: { criticalChecks: string[]; firstAction: string | null } | null;
  claims: Claim[];
  onOpenEvidence: (claim: Claim) => void;
  abstainReason?: string | null;
}) {
  if (abstainReason) {
    return (
      <section className="rounded-[var(--radius-card)] border border-warning/40 p-4" aria-label="Algorithm">
        <h3 className="text-sm font-semibold">Decision path</h3>
        <p className="mt-2 text-xs leading-relaxed text-warning">
          The available evidence does not support a full decision path for this question. {abstainReason}
        </p>
      </section>
    );
  }
  if (!graph) return null;

  const claimsById = new Map(claims.map((claim) => [claim.id, claim]));
  const startId = findStartNodeId(graph);
  const flat = startId ? flattenAlgorithmGraph(graph, startId) : [];
  const bandNodeIds = new Set([...(band?.criticalChecks ?? []), ...(band?.firstAction ? [band.firstAction] : [])]);
  const bandNodes = graph.nodes.filter((node) => bandNodeIds.has(node.id));

  function claimsFor(node: AlgorithmNode): Claim[] {
    return node.claimIds.map((id) => claimsById.get(id)).filter((claim): claim is Claim => !!claim);
  }

  return (
    <section className="rounded-[var(--radius-card)] border border-border p-4" aria-label="Algorithm">
      <h3 className="text-sm font-semibold">Decision path</h3>
      <p className="mt-2 text-xs leading-relaxed text-muted">
        A verified step-by-step path built only from the findings above. An "if" line is the
        structured condition that selects that branch.
      </p>

      {bandNodes.length > 0 && (
        <div className="mt-4 rounded-lg border border-border-strong bg-black/30 p-3" aria-label="Read first">
          <p className="text-[11px] uppercase tracking-wide text-muted">Read first</p>
          <ul className="mt-2 space-y-2">
            {bandNodes.map((node) => (
              <li key={node.id} className="flex flex-wrap items-center gap-2 text-xs">
                <Chip tone={chipTone(node.type)}>{NODE_LABEL[node.type]}</Chip>
                <span className="text-fg">{node.label}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <ol className="mt-4 space-y-3">
        {flat.map((entry, index) => (
          <li key={`${entry.node.id}-${index}`} style={{ marginLeft: `${entry.depth * 16}px` }} className="text-xs">
            {entry.edgeLabel && <p className="text-muted-2">if {entry.edgeLabel}</p>}
            <div className="flex flex-wrap items-center gap-2">
              <Chip tone={chipTone(entry.node.type)}>{NODE_LABEL[entry.node.type]}</Chip>
              <span className="text-fg">{entry.node.label}</span>
              {entry.isBackReference && <span className="text-muted-2">(returns here)</span>}
            </div>
            {entry.node.detail && <p className="mt-1 text-muted">{entry.node.detail}</p>}
            {!entry.isBackReference && claimsFor(entry.node).length > 0 && (
              <ul className="mt-1 space-y-1">
                {claimsFor(entry.node).map((claim) => (
                  <li key={claim.id}>
                    <button
                      type="button"
                      onClick={() => onOpenEvidence(claim)}
                      className="text-left leading-relaxed text-muted underline decoration-border-strong underline-offset-4 hover:text-fg hover:decoration-fg"
                    >
                      {claim.text}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}
