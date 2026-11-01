// Visualization modes (landing search bar + dashboard composer). Scoped to what the
// product can actually produce today: the "Evidence" list view, Algorithm (module
// 06) and Mechanism (module 08) are real; the radial Evidence Map (module 07's map
// half) is still a placeholder (its agent/renderer aren't built, SECURITY.md).
// "Mode" therefore only ever hints `intent` to the router (P1) and decides which
// result tab opens by default — it never fabricates a different visualization per
// mode (brief §6: "never invent relationships/visualizations to complete a view").

export type Mode = 'auto' | 'algorithm' | 'mechanism' | 'evidence_map';

export interface ModeOption {
  value: Mode;
  label: string;
  description: string;
}

export const MODE_OPTIONS: ModeOption[] = [
  { value: 'auto', label: 'Auto', description: 'The system identifies the best representation for your question.' },
  { value: 'algorithm', label: 'Algorithm', description: 'Flowcharts, decision trees, sequential and conditional pathways.' },
  { value: 'mechanism', label: 'Mechanism', description: 'Molecular mechanism diagrams — entities and their interactions.' },
  { value: 'evidence_map', label: 'Evidence Map', description: 'Networks of concepts, sources, connections and relationships.' },
];

export const DEFAULT_MODE: Mode = 'auto';
