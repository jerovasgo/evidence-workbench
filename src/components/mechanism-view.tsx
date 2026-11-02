'use client';

import { useEffect, useState } from 'react';
import { ReactFlow, ReactFlowProvider, Background, Controls, MarkerType, type Edge, type EdgeMouseHandler, type Node } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import type { Claim } from '@/shared/domain';
import { layoutMechanismGraph, type MechanismGraph } from '@/modules/08-mechanism';
import { mechanismNodeTypes, type MechanismFlowNodeData } from '@/components/mechanism-flow-nodes';
import { humanizeAbstainReason } from '@/lib/i18n/abstain-reason';

// Module 08 V1 renderer (docs/DECISIONS.md, 2026-10-31): a React Flow + elkjs
// canvas, mirroring `algorithm-view.tsx`'s shape, with one real difference —
// entities (nodes) carry no claim of their own; only interactions (edges) do
// (`Interaction.claimId`). Evidence is reached by clicking an edge, not a node.

export function MechanismView({
  graph,
  claims,
  onOpenEvidence,
  abstainReason,
}: {
  graph: MechanismGraph | null;
  claims: Claim[];
  onOpenEvidence: (claim: Claim) => void;
  abstainReason?: string | null;
}) {
  const [flowNodes, setFlowNodes] = useState<Node<MechanismFlowNodeData>[]>([]);
  const [flowEdges, setFlowEdges] = useState<Edge[]>([]);
  const [isLayingOut, setIsLayingOut] = useState(false);

  useEffect(() => {
    if (!graph) {
      setFlowNodes([]);
      setFlowEdges([]);
      return;
    }
    let cancelled = false;
    setIsLayingOut(true);

    layoutMechanismGraph(graph).then((layout) => {
      if (cancelled) return;
      setFlowNodes(
        layout.nodes.map((flowNode): Node<MechanismFlowNodeData> => ({
          id: flowNode.id,
          type: flowNode.type,
          position: flowNode.position,
          width: flowNode.width,
          height: flowNode.height,
          draggable: false,
          selectable: false,
          data: { entity: flowNode.data.entity },
        })),
      );
      setFlowEdges(
        layout.edges.map((edge): Edge => ({
          id: edge.id,
          source: edge.source,
          target: edge.target,
          label: edge.label,
          type: 'smoothstep',
          markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16 },
          style: edge.data.interaction.sign === '-' ? { strokeDasharray: '2 4' } : undefined,
          labelStyle: { fill: 'var(--color-muted)', fontSize: 10 },
          labelBgStyle: { fill: 'var(--color-bg)', fillOpacity: 0.85 },
          data: { claimId: edge.data.interaction.claimId },
        })),
      );
      setIsLayingOut(false);
    });

    return () => {
      cancelled = true;
    };
  }, [graph]);

  if (abstainReason) {
    return (
      <section className="rounded-[var(--radius-card)] border border-warning/40 p-4" aria-label="Mechanism">
        <h3 className="text-sm font-semibold">Mechanism diagram</h3>
        <p className="mt-2 text-xs leading-relaxed text-warning">
          The available evidence does not support a verified mechanism diagram for this question. {humanizeAbstainReason(abstainReason, 'mechanism diagram')}
        </p>
      </section>
    );
  }
  if (!graph) return null;

  const claimsById = new Map(claims.map((claim) => [claim.id, claim]));
  const handleEdgeClick: EdgeMouseHandler = (_event, edge) => {
    const claimId = (edge.data as { claimId?: string } | undefined)?.claimId;
    const claim = claimId ? claimsById.get(claimId) : undefined;
    if (claim) onOpenEvidence(claim);
  };

  return (
    <section className="rounded-[var(--radius-card)] border border-border p-4" aria-label="Mechanism">
      <h3 className="text-sm font-semibold">Mechanism diagram</h3>
      <p className="mt-2 text-xs leading-relaxed text-muted">
        {graph.scope ? `${graph.scope}. ` : ''}A verified molecular mechanism built only from the findings above. Click an
        arrow for its source quote.
      </p>

      <div className="relative mt-4 h-[480px] w-full overflow-hidden rounded-lg border border-border bg-black/20">
        {isLayingOut && flowNodes.length === 0 ? (
          <div role="status" aria-label="Computing layout" className="flex h-full items-center justify-center text-xs text-muted">
            Laying out the mechanism diagram…
          </div>
        ) : (
          <ReactFlowProvider>
            <ReactFlow
              nodes={flowNodes}
              edges={flowEdges}
              nodeTypes={mechanismNodeTypes}
              nodesDraggable={false}
              nodesConnectable={false}
              onEdgeClick={handleEdgeClick}
              fitView
              fitViewOptions={{ padding: 0.15 }}
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
