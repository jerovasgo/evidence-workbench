'use client';

import { memo } from 'react';
import { Handle, Position, type Node, type NodeProps } from '@xyflow/react';
import { AlertTriangle, CheckCircle2, CircleSlash, FlaskConical, GitBranch, RotateCcw, ScanSearch, Wrench } from 'lucide-react';
import type { Claim } from '@/shared/domain';
import type { AlgorithmNode } from '@/modules/06-algorithm';
import { cn } from '@/lib/cn';

// Module 06 V1.1 renderer (docs/DECISIONS.md, 2026-10-31): real flowchart node
// shapes, replacing V1's step-list entries. Per node type, this dual-codes with a
// distinct SHAPE (diamond for decision, rect otherwise) and an icon, not a literal
// saturated hue — the reference image's pink/yellow/green was a shape/arrows
// reference, not a license to break SPEC §11's "no color-only meaning" (see
// `CertaintyPips`'s own comment in `ui/chip.tsx`). Border/fill stays within the
// existing dark design tokens (`--color-warning`/`--color-conflict`), used the same
// way `Chip` already uses them elsewhere in this app.

export interface AlgorithmFlowNodeData extends Record<string, unknown> {
  node: AlgorithmNode;
  primaryClaim: Claim | undefined;
  extraClaimsCount: number;
  onOpenEvidence: (claim: Claim) => void;
  isBandHighlighted: boolean;
}
export type AlgorithmFlowNodeType = Node<AlgorithmFlowNodeData, AlgorithmNode['type']>;

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

const NODE_ICON: Record<AlgorithmNode['type'], typeof AlertTriangle> = {
  critical_check: AlertTriangle,
  assess: ScanSearch,
  method: FlaskConical,
  decision: GitBranch,
  action: Wrench,
  outcome: CheckCircle2,
  iterate: RotateCcw,
  abstain: CircleSlash,
};

function AlgorithmFlowNodeComponent({ data }: NodeProps<AlgorithmFlowNodeType>) {
  const { node, primaryClaim, extraClaimsCount, onOpenEvidence, isBandHighlighted } = data;
  const Icon = NODE_ICON[node.type];
  const isDecision = node.type === 'decision';
  const clickable = !!primaryClaim;

  const handleActivate = () => {
    if (primaryClaim) onOpenEvidence(primaryClaim);
  };

  const body = (
    <div
      role={clickable ? 'button' : undefined}
      tabIndex={clickable ? 0 : undefined}
      onClick={clickable ? handleActivate : undefined}
      onKeyDown={clickable ? (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); handleActivate(); } } : undefined}
      className={cn(
        'flex h-full w-full flex-col items-center justify-center gap-0.5 border px-3 py-2 text-center',
        isDecision ? 'rounded-lg' : 'rounded-[var(--radius-card)]',
        node.type === 'abstain' ? 'border-dashed border-conflict/50' : 'border-solid',
        node.type === 'critical_check' && 'border-warning/50',
        node.type !== 'abstain' && node.type !== 'critical_check' && (isBandHighlighted ? 'border-border-strong' : 'border-border'),
        node.type === 'outcome' ? 'bg-glass-strong' : 'bg-glass',
        clickable && 'cursor-pointer hover:border-fg/40',
      )}
    >
      <div className="flex items-center justify-center gap-1.5">
        <Icon className="h-3.5 w-3.5 shrink-0 text-muted" aria-hidden="true" />
        <span className="text-[10px] uppercase tracking-wide text-muted">{NODE_LABEL[node.type]}</span>
      </div>
      <p className="text-xs leading-snug font-medium text-fg">{node.label}</p>
      {clickable && (
        <p className="text-[10px] text-muted-2 underline decoration-border-strong underline-offset-2">
          {extraClaimsCount > 0 ? `Evidence (+${extraClaimsCount} more)` : 'Evidence'}
        </p>
      )}
    </div>
  );

  return (
    <div className="relative flex h-full w-full items-center justify-center">
      <Handle type="target" position={Position.Top} className="!h-1 !w-1 !border-0 !bg-border-strong" />
      {isDecision ? (
        <div className="flex h-[132px] w-[132px] rotate-45 items-center justify-center">
          <div className="h-full w-full -rotate-45">{body}</div>
        </div>
      ) : (
        body
      )}
      {isBandHighlighted && <span className="absolute -top-2 -right-2 rounded-full bg-fg px-1.5 py-0.5 text-[9px] font-semibold text-bg">Read first</span>}
      <Handle type="source" position={Position.Bottom} className="!h-1 !w-1 !border-0 !bg-border-strong" />
    </div>
  );
}

export const AlgorithmFlowNode = memo(AlgorithmFlowNodeComponent);

export const algorithmNodeTypes = {
  critical_check: AlgorithmFlowNode,
  assess: AlgorithmFlowNode,
  method: AlgorithmFlowNode,
  decision: AlgorithmFlowNode,
  action: AlgorithmFlowNode,
  outcome: AlgorithmFlowNode,
  iterate: AlgorithmFlowNode,
  abstain: AlgorithmFlowNode,
};
