'use client';

import * as Tabs from '@radix-ui/react-tabs';

// Illustrative sketches only — schematic, not real data (brief §6: never present a
// static demo as if it were a real result). The one view that's actually real today
// is "Evidence" (src/app/runs/[id]/run-view.tsx); these four correspond to the same
// view-tab names used there.

const VIEWS = [
  { value: 'algorithm', label: 'Algorithm', caption: 'A decision tree branches from assessment to action, conditioned on verified findings.' },
  { value: 'map', label: 'Evidence Map', caption: 'Claims, sources and their relationships laid out as a connected network.' },
  { value: 'matrix', label: 'Matrix', caption: 'Findings compared side by side across sources and certainty.' },
  { value: 'mechanism', label: 'Mechanism', caption: 'The underlying pathway, traced step by step with its supporting evidence.' },
] as const;

function AlgorithmSketch() {
  return (
    <svg viewBox="0 0 400 220" className="h-full w-full" aria-hidden="true">
      <g stroke="currentColor" strokeWidth="1" fill="none" opacity="0.6">
        <rect x="160" y="10" width="80" height="32" rx="8" />
        <line x1="200" y1="42" x2="200" y2="70" />
        <rect x="150" y="70" width="100" height="32" rx="8" />
        <line x1="200" y1="102" x2="110" y2="140" />
        <line x1="200" y1="102" x2="290" y2="140" />
        <rect x="60" y="140" width="100" height="32" rx="8" />
        <rect x="240" y="140" width="100" height="32" rx="8" />
      </g>
    </svg>
  );
}

function EvidenceMapSketch() {
  const nodes = [
    [200, 110],
    [100, 50],
    [300, 50],
    [80, 170],
    [320, 170],
    [200, 30],
  ];
  const edges: [number, number][] = [
    [0, 1],
    [0, 2],
    [0, 3],
    [0, 4],
    [1, 5],
    [2, 5],
  ];
  return (
    <svg viewBox="0 0 400 220" className="h-full w-full" aria-hidden="true">
      <g stroke="currentColor" strokeWidth="1" opacity="0.5">
        {edges.map(([a, b], i) => (
          <line key={i} x1={nodes[a]![0]} y1={nodes[a]![1]} x2={nodes[b]![0]} y2={nodes[b]![1]} />
        ))}
      </g>
      <g fill="currentColor" opacity="0.8">
        {nodes.map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r={i === 0 ? 7 : 5} />
        ))}
      </g>
    </svg>
  );
}

function MatrixSketch() {
  return (
    <svg viewBox="0 0 400 220" className="h-full w-full" aria-hidden="true">
      <g stroke="currentColor" strokeWidth="1" opacity="0.5">
        {Array.from({ length: 5 }, (_, row) => (
          <line key={`r${row}`} x1="40" y1={30 + row * 36} x2="360" y2={30 + row * 36} />
        ))}
        {Array.from({ length: 4 }, (_, col) => (
          <line key={`c${col}`} x1={40 + col * 107} y1="30" x2={40 + col * 107} y2="174" />
        ))}
      </g>
      <g fill="currentColor" opacity="0.8">
        {(
          [
            [1, 0],
            [2, 1],
            [0, 2],
            [3, 3],
          ] as [number, number][]
        ).map(([col, row], i) => (
          <circle key={i} cx={40 + col * 107 + 53} cy={30 + row * 36 + 18} r="6" />
        ))}
      </g>
    </svg>
  );
}

function MechanismSketch() {
  return (
    <svg viewBox="0 0 400 220" className="h-full w-full" aria-hidden="true">
      <g stroke="currentColor" strokeWidth="1" fill="none" opacity="0.6">
        <path d="M30 110 C 120 30, 180 190, 270 60 S 370 110, 370 110" />
      </g>
      <g fill="currentColor" opacity="0.85">
        <circle cx="30" cy="110" r="5" />
        <circle cx="150" cy="80" r="5" />
        <circle cx="230" cy="120" r="5" />
        <circle cx="370" cy="110" r="5" />
      </g>
    </svg>
  );
}

const SKETCHES: Record<(typeof VIEWS)[number]['value'], () => React.JSX.Element> = {
  algorithm: AlgorithmSketch,
  map: EvidenceMapSketch,
  matrix: MatrixSketch,
  mechanism: MechanismSketch,
};

export function VisualizeTabs() {
  return (
    <section id="visualize" className="mx-auto max-w-4xl px-6 py-28">
      <h2 className="text-center text-3xl font-semibold tracking-tight text-fg sm:text-4xl">Visualize your thinking.</h2>

      <Tabs.Root defaultValue="algorithm" className="mt-14 flex flex-col items-center gap-6">
        <Tabs.List className="flex flex-wrap justify-center gap-1 rounded-[var(--radius-pill)] border border-border p-1" aria-label="Visualization modes">
          {VIEWS.map((view) => (
            <Tabs.Trigger
              key={view.value}
              value={view.value}
              className="rounded-[var(--radius-pill)] px-4 py-1.5 text-sm text-muted transition-colors data-[state=active]:bg-fg data-[state=active]:text-bg"
            >
              {view.label}
            </Tabs.Trigger>
          ))}
        </Tabs.List>

        {VIEWS.map((view) => {
          const Sketch = SKETCHES[view.value];
          return (
            <Tabs.Content key={view.value} value={view.value} className="w-full">
              <div className="glass flex h-72 w-full items-center justify-center rounded-[var(--radius-card)] p-6 text-fg">
                <Sketch />
              </div>
              <p className="mt-4 text-center text-sm text-muted">
                {view.caption} <span className="text-muted-2">(Example — not live data.)</span>
              </p>
            </Tabs.Content>
          );
        })}
      </Tabs.Root>
    </section>
  );
}
