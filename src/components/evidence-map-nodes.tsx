'use client';

import { memo } from 'react';
import { Handle, Position, type Node, type NodeProps } from '@xyflow/react';
import { ChevronDown, ChevronRight, Plus } from 'lucide-react';
import type { Claim } from '@/shared/domain';
import type { MapNode } from '@/modules/07-map-matrix';
import { CertaintyPips, Chip } from '@/components/ui/chip';
import { cn } from '@/lib/cn';

// Module 07 V1 (docs/DECISIONS.md, 2026-11-01): one node shape per `MapNode.kind`,
// mirroring `claim-card.tsx`'s exact badge composition for a claim node (action
// type, safety-critical, support/verified, certainty — all already dual-coded by
// text+shape, "never color alone" for free) so the map reads consistently with the
// rest of the app, not as a separate visual language.

const ACTION_LABEL: Record<Claim['actionType'], string> = {
  finding: 'Finding',
  method: 'Method',
  measurement: 'Measurement',
  theory: 'Theory',
  mechanism: 'Mechanism',
  limitation: 'Limitation',
};

export interface MapFlowNodeData extends Record<string, unknown> {
  node: MapNode;
  claim?: Claim;
  isExpanded?: boolean;
  overflowCount?: number;
  isRevealed?: boolean;
  onToggleCollapse?: () => void;
  onReveal?: () => void;
  onOpenEvidence?: (claim: Claim) => void;
}
export type MapFlowNodeType = Node<MapFlowNodeData, MapNode['kind']>;

function RootNode({ data }: NodeProps<MapFlowNodeType>) {
  return (
    <div className="relative flex h-full w-full items-center justify-center">
      <div className="flex h-full w-full items-center justify-center rounded-full border border-border-strong bg-glass px-4 py-2 text-center">
        <p className="text-xs font-medium leading-snug text-fg">{data.node.label}</p>
      </div>
      <Handle type="source" position={Position.Bottom} className="!h-1 !w-1 !border-0 !bg-border-strong" />
    </div>
  );
}

function SubquestionNode({ data }: NodeProps<MapFlowNodeType>) {
  const overflow = data.overflowCount ?? 0;
  return (
    <div className="relative flex h-full w-full items-center justify-center">
      <Handle type="target" position={Position.Top} className="!h-1 !w-1 !border-0 !bg-border-strong" />
      <button
        type="button"
        onClick={data.onToggleCollapse}
        aria-expanded={data.isExpanded !== false}
        className="flex h-full w-full flex-col items-center justify-center gap-1 rounded-[var(--radius-card)] border border-border bg-glass px-3 py-2 text-center transition-colors duration-150 hover:border-border-strong"
      >
        <div className="flex items-center gap-1 text-muted">
          {data.isExpanded === false ? <ChevronRight size={12} aria-hidden="true" /> : <ChevronDown size={12} aria-hidden="true" />}
          <span className="text-[10px] uppercase tracking-wide">Sub-question</span>
        </div>
        <p className="text-xs leading-snug font-medium text-fg">{data.node.label}</p>
        {overflow > 0 && !data.isRevealed && (
          <span
            role="button"
            tabIndex={0}
            onClick={(event) => { event.stopPropagation(); data.onReveal?.(); }}
            onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.stopPropagation(); data.onReveal?.(); } }}
            className="mt-0.5 inline-flex items-center gap-1 rounded-[var(--radius-pill)] border border-border-strong px-1.5 py-0.5 text-[9px] text-muted-2 hover:border-fg hover:text-fg"
          >
            <Plus size={9} aria-hidden="true" />{overflow} more
          </span>
        )}
      </button>
      <Handle type="source" position={Position.Bottom} className="!h-1 !w-1 !border-0 !bg-border-strong" />
    </div>
  );
}

function ClaimNode({ data }: NodeProps<MapFlowNodeType>) {
  const claim = data.claim;
  return (
    <div className="relative flex h-full w-full items-center justify-center">
      <Handle type="target" position={Position.Top} className="!h-1 !w-1 !border-0 !bg-border-strong" />
      <button
        type="button"
        onClick={() => { if (claim) data.onOpenEvidence?.(claim); }}
        disabled={!claim}
        className={cn('flex h-full w-full flex-col justify-center gap-1 rounded-[var(--radius-card)] border border-border bg-glass px-3 py-2 text-left transition-colors duration-150 hover:border-border-strong')}
      >
        {claim && (
          <div className="flex flex-wrap items-center gap-1 text-[9px]">
            <Chip>{ACTION_LABEL[claim.actionType]}</Chip>
            {claim.safetyCritical && <Chip tone="conflict">Safety-critical</Chip>}
          </div>
        )}
        <p className="line-clamp-3 text-xs leading-snug text-fg">{data.node.label}</p>
        {claim && claim.grade.certainty !== 'ungraded' && <CertaintyPips certainty={claim.grade.certainty} />}
      </button>
    </div>
  );
}

export const mapNodeTypes = {
  root: memo(RootNode),
  subquestion: memo(SubquestionNode),
  claim: memo(ClaimNode),
};
