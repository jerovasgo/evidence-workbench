'use client';

import { useEffect, useState } from 'react';
import { ReactFlow, ReactFlowProvider, Background, Controls, MarkerType, type Edge, type Node } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import type { Claim } from '@/shared/domain';
import { layoutAlgorithmGraph, type AlgorithmGraph, type AlgorithmNode } from '@/modules/06-algorithm';
import { Chip } from '@/components/ui/chip';
import { algorithmNodeTypes, type AlgorithmFlowNodeData, type AlgorithmFlowNodeType } from '@/components/algorithm-flow-nodes';

// Module 06 V1.1 renderer (docs/DECISIONS.md, 2026-10-31): a real flowchart canvas
// (React Flow + elkjs layout, `@/modules/06-algorithm`'s `layoutAlgorithmGraph`),
// replacing V1's indented step list after direct user feedback that the step list
// didn't read as an actual algorithm. The "Read first" band summary above the
// canvas is unchanged from V1 — it's the <10s scan path; the canvas is for reading
// the full structure. Every node with cited claims opens the same evidence drawer
// as every other view (`onOpenEvidence`).

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
  const [flowNodes, setFlowNodes] = useState<Node<AlgorithmFlowNodeData>[]>([]);
  const [flowEdges, setFlowEdges] = useState<Edge[]>([]);
  const [isLayingOut, setIsLayingOut] = useState(false);

  useEffect(() => {
    if (!graph) {
      setFlowNodes([]);
      setFlowEdges([]);
      return;
    }
    const claimsById = new Map(claims.map((claim) => [claim.id, claim]));
    const bandNodeIds = new Set([...(band?.criticalChecks ?? []), ...(band?.firstAction ? [band.firstAction] : [])]);
    let cancelled = false;
    setIsLayingOut(true);

    layoutAlgorithmGraph(graph).then((layout) => {
      if (cancelled) return;
      setFlowNodes(
        layout.nodes.map((flowNode): AlgorithmFlowNodeType => {
          const nodeClaims = flowNode.data.node.claimIds.map((id) => claimsById.get(id)).filter((claim): claim is Claim => !!claim);
          return {
            id: flowNode.id,
            type: flowNode.type,
            position: flowNode.position,
            width: flowNode.width,
            height: flowNode.height,
            draggable: false,
            selectable: false,
            data: {
              node: flowNode.data.node,
              primaryClaim: nodeClaims[0],
              extraClaimsCount: Math.max(0, nodeClaims.length - 1),
              onOpenEvidence,
              isBandHighlighted: bandNodeIds.has(flowNode.id),
            },
          };
        }),
      );
      setFlowEdges(
        layout.edges.map((edge): Edge => ({
          id: edge.id,
          source: edge.source,
          target: edge.target,
          label: edge.label,
          type: 'smoothstep',
          markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16 },
          style: edge.data.isLoopBack ? { strokeDasharray: '6 4', opacity: 0.6 } : undefined,
          labelStyle: { fill: 'var(--color-muted)', fontSize: 10 },
          labelBgStyle: { fill: 'var(--color-bg)', fillOpacity: 0.85 },
        })),
      );
      setIsLayingOut(false);
    });

    return () => {
      cancelled = true;
    };
    // `claims`/`band`/`onOpenEvidence` only ever change together with a new `graph`
    // (a new SSE `algorithm_ready` event) — depending on `graph` alone avoids
    // relaying out on every unrelated render.
  }, [graph]);

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

  const bandNodeIds = new Set([...(band?.criticalChecks ?? []), ...(band?.firstAction ? [band.firstAction] : [])]);
  const bandNodes = graph.nodes.filter((node) => bandNodeIds.has(node.id));

  return (
    <section className="rounded-[var(--radius-card)] border border-border p-4" aria-label="Algorithm">
      <h3 className="text-sm font-semibold">Decision path</h3>
      <p className="mt-2 text-xs leading-relaxed text-muted">
        A verified flowchart built only from the findings above. Diamonds are decision points; an edge
        label is the structured condition that selects that branch. Click a step for its source quote.
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

      <div className="relative mt-4 h-[480px] w-full overflow-hidden rounded-lg border border-border bg-black/20">
        {isLayingOut && flowNodes.length === 0 ? (
          <div role="status" aria-label="Computing layout" className="flex h-full items-center justify-center text-xs text-muted">
            Laying out the decision path…
          </div>
        ) : (
          <ReactFlowProvider>
            <ReactFlow
              nodes={flowNodes}
              edges={flowEdges}
              nodeTypes={algorithmNodeTypes}
              nodesDraggable={false}
              nodesConnectable={false}
              elementsSelectable={false}
              fitView
              fitViewOptions={{ padding: 0.15 }}
              proOptions={{ hideAttribution: false }}
              minZoom={0.2}
            >
              <Background gap={24} className="opacity-40" />
              <Controls showInteractive={false} />
            </ReactFlow>
          </ReactFlowProvider>
        )}
      </div>
    </section>
  );
}
