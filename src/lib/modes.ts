// Visualization modes (landing search bar + dashboard composer). Scoped to what the
// product can actually produce today: only the "Evidence" list view is real
// (src/app/runs/[id]/run-view.tsx); Algorithm/Map/Matrix/Mechanism are placeholders
// (their modules aren't built, SECURITY.md). "Mode" therefore only ever hints
// `intent` to the router (P1) and decides which result tab opens by default — it
// never fabricates a different visualization per mode (brief §6: "never invent
// relationships/visualizations to complete a view").

export type Mode = 'auto' | 'algorithm' | 'evidence_map';

export interface ModeOption {
  value: Mode;
  label: string;
  description: string;
}

export const MODE_OPTIONS: ModeOption[] = [
  { value: 'auto', label: 'Auto', description: 'The system identifies the best representation for your question.' },
  { value: 'algorithm', label: 'Algorithm', description: 'Flowcharts, decision trees, sequential and conditional pathways.' },
  { value: 'evidence_map', label: 'Evidence Map', description: 'Networks of concepts, sources, connections and relationships.' },
];

export const DEFAULT_MODE: Mode = 'auto';
