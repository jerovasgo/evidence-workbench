import ELK from 'elkjs/lib/elk.bundled.js';
import type { ElkNode } from 'elkjs/lib/elk-api';
import type { Entity, Interaction, MechanismGraph } from '../schemas/mechanism';

// Module 08 V1 (docs/DECISIONS.md, 2026-10-31): the mechanism canvas's layout,
// computed by elkjs (layered), mirroring `06-algorithm/pipeline/layout-algorithm.ts`.
// Still 100% code-computed, never model-positioned. Unlike an algorithm graph, a
// mechanism graph has no sanctioned `iterate`-style back-edge to special-case —
// a genuine feedback loop in a signalling pathway is just a cycle, and elk's
// layered algorithm already breaks cycles internally for layout purposes (its own
// default cycle-breaking strategy), so every edge is fed in directly.

export interface MechanismFlowNodeData extends Record<string, unknown> {
  entity: Entity;
}
export interface MechanismFlowNode {
  id: string;
  type: Entity['kind'];
  position: { x: number; y: number };
  width: number;
  height: number;
  data: MechanismFlowNodeData;
}

export interface MechanismFlowEdgeData extends Record<string, unknown> {
  interaction: Interaction;
}
export interface MechanismFlowEdge {
  id: string;
  source: string;
  target: string;
  /** Top-level, not nested in `data` — matches `@xyflow/react`'s own `Edge.label` prop. */
  label: string;
  data: MechanismFlowEdgeData;
}

export interface MechanismLayout {
  nodes: MechanismFlowNode[];
  edges: MechanismFlowEdge[];
}

const NODE_SIZE = { width: 180, height: 76 };

export async function layoutMechanismGraph(graph: MechanismGraph): Promise<MechanismLayout> {
  const entitiesById = new Map(graph.entities.map((entity) => [entity.id, entity]));

  const elk = new ELK();
  const elkGraph: ElkNode = {
    id: 'root',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': 'DOWN',
      'elk.layered.spacing.nodeNodeBetweenLayers': '64',
      'elk.spacing.nodeNode': '48',
    },
    children: graph.entities.map((entity) => ({ id: entity.id, ...NODE_SIZE })),
    edges: graph.interactions.map((interaction, index) => ({
      id: `e${index}`,
      sources: [interaction.from],
      targets: [interaction.to],
    })),
  };

  const result = await elk.layout(elkGraph);

  const nodes: MechanismFlowNode[] = (result.children ?? []).flatMap((child) => {
    const entity = entitiesById.get(child.id);
    if (!entity) return [];
    return [{ id: entity.id, type: entity.kind, position: { x: child.x ?? 0, y: child.y ?? 0 }, width: NODE_SIZE.width, height: NODE_SIZE.height, data: { entity } }];
  });

  const edges: MechanismFlowEdge[] = graph.interactions.map((interaction, index) => ({
    id: `edge-${index}-${interaction.id}`,
    source: interaction.from,
    target: interaction.to,
    label: interaction.type.replace(/_/g, ' '),
    data: { interaction },
  }));

  return { nodes, edges };
}
