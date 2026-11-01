'use client';

import { useEffect, useMemo, useState } from 'react';
import { ReactFlow, ReactFlowProvider, Background, Controls, type Edge, type Node } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import type { Claim } from '@/shared/domain';
import { buildMapTree, layoutMapTree, type MapNode } from '@/modules/07-map-matrix';
import { mapNodeTypes, type MapFlowNodeData } from '@/components/evidence-map-nodes';

// Module 07 V1 (docs/DECISIONS.md, 2026-11-01): a React Flow + elkjs radial canvas,
// mirroring `algorithm-view.tsx`/`mechanism-view.tsx`'s shape, over `buildMapTree`'s
// pure projection (`@/modules/07-map-matrix`) — no model call, no SSE event, no
// server round-trip anywhere in this component: `claims`/`questions`/`query` are
// already in `RunStreamState`/props by the time this renders. Collapse/expand and
// the "+N more" reveal are local React state only, re-running the same pure
// projection — SPEC: "expansion fetches nothing new, data is already loaded."

/** Filters an already-built tree for layout: a collapsed branch keeps its node (so
 *  its label and overflow badge stay visible) but contributes no children, so the
 *  canvas never lays out hidden claims. Independent of `truncatedByBranch`, which is
 *  computed from the un-collapsed tree so a reopened branch's badge stays accurate. */
function collapseForLayout(tree: MapNode[], collapsed: ReadonlySet<string>): MapNode[] {
  return tree.map((node) => ({ ...node, children: collapsed.has(node.id) ? [] : collapseForLayout(node.children, collapsed) }));
}

export function EvidenceMapView({
  claims,
  questions,
  query,
  onOpenEvidence,
}: {
  claims: Claim[];
  questions: string[];
  query: string;
  onOpenEvidence: (claim: Claim) => void;
}) {
  const [collapsedBranches, setCollapsedBranches] = useState<Set<string>>(new Set());
  const [revealedBranches, setRevealedBranches] = useState<Set<string>>(new Set());
  const [viewMode, setViewMode] = useState<'canvas' | 'list'>('canvas');
  const [flowNodes, setFlowNodes] = useState<Node<MapFlowNodeData>[]>([]);
  const [flowEdges, setFlowEdges] = useState<Edge[]>([]);
  const [isLayingOut, setIsLayingOut] = useState(false);

  const claimsById = useMemo(() => new Map(claims.map((claim) => [claim.id, claim])), [claims]);

  const { tree, truncatedBranches, truncatedByBranch } = useMemo(
    () => buildMapTree(claims, questions, query, { revealedBranchIds: revealedBranches }),
    [claims, questions, query, revealedBranches],
  );
  const hasAnyFindings = (tree[0]?.children.length ?? 0) > 0;
  const visibleTree = useMemo(() => collapseForLayout(tree, collapsedBranches), [tree, collapsedBranches]);

  useEffect(() => {
    let cancelled = false;
    setIsLayingOut(true);

    layoutMapTree(visibleTree).then((layout) => {
      if (cancelled) return;
      setFlowNodes(
        layout.nodes.map((flowNode): Node<MapFlowNodeData> => {
          const mapNode = flowNode.data.node;
          const isSubquestion = mapNode.kind === 'subquestion';
          return {
            id: flowNode.id,
            type: flowNode.type,
            position: flowNode.position,
            width: flowNode.width,
            height: flowNode.height,
            draggable: false,
            selectable: false,
            data: {
              node: mapNode,
              claim: mapNode.claimId ? claimsById.get(mapNode.claimId) : undefined,
              isExpanded: isSubquestion ? !collapsedBranches.has(mapNode.id) : undefined,
              overflowCount: isSubquestion ? (truncatedByBranch.get(mapNode.id) ?? 0) : undefined,
              isRevealed: isSubquestion ? revealedBranches.has(mapNode.id) : undefined,
              onToggleCollapse: isSubquestion
                ? () => setCollapsedBranches((prev) => {
                    const next = new Set(prev);
                    if (next.has(mapNode.id)) next.delete(mapNode.id); else next.add(mapNode.id);
                    return next;
                  })
                : undefined,
              onReveal: isSubquestion ? () => setRevealedBranches((prev) => new Set(prev).add(mapNode.id)) : undefined,
              onOpenEvidence: mapNode.kind === 'claim' ? onOpenEvidence : undefined,
            },
          };
        }),
      );
      setFlowEdges(layout.edges.map((edge): Edge => ({ id: edge.id, source: edge.source, target: edge.target, type: 'straight' })));
      setIsLayingOut(false);
    });

    return () => {
      cancelled = true;
    };
  }, [visibleTree, claimsById, collapsedBranches, truncatedByBranch, revealedBranches, onOpenEvidence]);

  if (!hasAnyFindings) {
    return (
      <section className="rounded-[var(--radius-card)] border border-border p-4" aria-label="Evidence map">
        <h3 className="text-sm font-semibold">Evidence map</h3>
        <p className="mt-2 text-xs leading-relaxed text-muted">No verified findings yet — the map will populate as evidence is verified.</p>
      </section>
    );
  }

  return (
    <section className="rounded-[var(--radius-card)] border border-border p-4" aria-label="Evidence map">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold">Evidence map</h3>
        <button type="button" onClick={() => setViewMode((mode) => (mode === 'canvas' ? 'list' : 'canvas'))} className="text-xs text-muted underline underline-offset-4 hover:text-fg">
          {viewMode === 'canvas' ? 'View as list' : 'View as map'}
        </button>
      </div>
      <p className="mt-2 text-xs leading-relaxed text-muted">
        A radial overview of the verified evidence, grouped by sub-question. Click a branch to expand or collapse it; click a finding for its source quote.
        {truncatedBranches > 0 ? ` ${truncatedBranches} additional sub-question(s) not shown.` : ''}
      </p>

      {viewMode === 'list' ? (
        <MapListView tree={tree} claimsById={claimsById} onOpenEvidence={onOpenEvidence} />
      ) : (
        <div className="relative mt-4 h-[480px] w-full overflow-hidden rounded-lg border border-border bg-black/20">
          {isLayingOut && flowNodes.length === 0 ? (
            <div role="status" aria-label="Computing layout" className="flex h-full items-center justify-center text-xs text-muted">
              Laying out the evidence map…
            </div>
          ) : (
            <ReactFlowProvider>
              <ReactFlow
                nodes={flowNodes}
                edges={flowEdges}
                nodeTypes={mapNodeTypes}
                nodesDraggable={false}
                nodesConnectable={false}
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
      )}
    </section>
  );
}

/** SPEC's screen-reader/keyboard fallback: "Map unreadable for screen readers ->
 *  Tree/list fallback (same data), keyboard navigation." Same `tree`, no new data. */
function MapListView({ tree, claimsById, onOpenEvidence }: { tree: MapNode[]; claimsById: Map<string, Claim>; onOpenEvidence: (claim: Claim) => void }) {
  const root = tree[0];
  if (!root) return null;
  return (
    <nav aria-label="Evidence map, list view" className="mt-4">
      <p className="text-sm font-medium text-fg">{root.label}</p>
      <ul className="mt-2 space-y-3">
        {root.children.map((branch) => (
          <li key={branch.id}>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">{branch.label}</p>
            <ul className="mt-1 space-y-1 border-l border-border pl-3">
              {branch.children.map((claimNode) => {
                const claim = claimNode.claimId ? claimsById.get(claimNode.claimId) : undefined;
                return (
                  <li key={claimNode.id}>
                    <button
                      type="button"
                      onClick={() => { if (claim) onOpenEvidence(claim); }}
                      disabled={!claim}
                      className="text-left text-xs leading-5 text-fg underline decoration-border underline-offset-4 hover:decoration-fg disabled:no-underline"
                    >
                      {claimNode.label}
                    </button>
                  </li>
                );
              })}
            </ul>
          </li>
        ))}
      </ul>
    </nav>
  );
}
