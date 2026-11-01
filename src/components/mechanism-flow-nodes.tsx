'use client';

import { memo } from 'react';
import { Handle, Position, type Node, type NodeProps } from '@xyflow/react';
import { Atom, Beaker, Dna, FlaskConical, HelpCircle, Magnet, Radio, Shuffle, Sparkles, Waves, Zap } from 'lucide-react';
import type { Entity } from '@/modules/08-mechanism';
import { cn } from '@/lib/cn';

// Module 08 V1 renderer (docs/DECISIONS.md, 2026-10-31): one consistent node
// shape (a rounded rect — no diamond/decision special case, mechanism entities
// have no binary-choice kind) with a lucide icon per `Entity.kind`, the same
// shape-and-icon dual-coding `algorithm-flow-nodes.tsx` already uses, closest to
// the architecture doc's "one consistent glyph line style" without a bespoke SVG
// glyph library. `compartment` shows as a small text badge, not a positioned
// lane (V1 scope decision #3).

export interface MechanismFlowNodeData extends Record<string, unknown> {
  entity: Entity;
}
export type MechanismFlowNodeType = Node<MechanismFlowNodeData, Entity['kind']>;

const ENTITY_LABEL: Record<Entity['kind'], string> = {
  ligand: 'Ligand',
  receptor: 'Receptor',
  channel: 'Channel',
  g_protein: 'G protein',
  enzyme: 'Enzyme',
  kinase: 'Kinase',
  second_messenger: 'Second messenger',
  transcription_factor: 'Transcription factor',
  reactant: 'Reactant',
  catalyst: 'Catalyst',
  intermediate: 'Intermediate',
  product: 'Product',
  transition_state: 'Transition state',
  other: 'Entity',
};

const ENTITY_ICON: Record<Entity['kind'], typeof Dna> = {
  ligand: Zap,
  receptor: Radio,
  channel: Waves,
  g_protein: Shuffle,
  enzyme: FlaskConical,
  kinase: Sparkles,
  second_messenger: Magnet,
  transcription_factor: Dna,
  reactant: Beaker,
  catalyst: Atom,
  intermediate: Shuffle,
  product: Beaker,
  transition_state: Atom,
  other: HelpCircle,
};

function MechanismFlowNodeComponent({ data }: NodeProps<MechanismFlowNodeType>) {
  const { entity } = data;
  const Icon = ENTITY_ICON[entity.kind];

  return (
    <div className="relative flex h-full w-full items-center justify-center">
      <Handle type="target" position={Position.Top} className="!h-1 !w-1 !border-0 !bg-border-strong" />
      <div className={cn('flex h-full w-full flex-col items-center justify-center gap-0.5 rounded-[var(--radius-card)] border border-border bg-glass px-3 py-2 text-center')}>
        <div className="flex items-center justify-center gap-1.5">
          <Icon className="h-3.5 w-3.5 shrink-0 text-muted" aria-hidden="true" />
          <span className="text-[10px] uppercase tracking-wide text-muted">{ENTITY_LABEL[entity.kind]}</span>
        </div>
        <p className="text-xs leading-snug font-medium text-fg">{entity.label}</p>
        {entity.compartment && <span className="rounded-[var(--radius-pill)] border border-border-strong px-1.5 py-0.5 text-[9px] text-muted-2">{entity.compartment.replace(/_/g, ' ')}</span>}
      </div>
      <Handle type="source" position={Position.Bottom} className="!h-1 !w-1 !border-0 !bg-border-strong" />
    </div>
  );
}

export const MechanismFlowNode = memo(MechanismFlowNodeComponent);

export const mechanismNodeTypes = {
  ligand: MechanismFlowNode,
  receptor: MechanismFlowNode,
  channel: MechanismFlowNode,
  g_protein: MechanismFlowNode,
  enzyme: MechanismFlowNode,
  kinase: MechanismFlowNode,
  second_messenger: MechanismFlowNode,
  transcription_factor: MechanismFlowNode,
  reactant: MechanismFlowNode,
  catalyst: MechanismFlowNode,
  intermediate: MechanismFlowNode,
  product: MechanismFlowNode,
  transition_state: MechanismFlowNode,
  other: MechanismFlowNode,
};
