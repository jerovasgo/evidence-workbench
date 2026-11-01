'use client';

import { useState } from 'react';
import { SearchBar } from '@/components/search-bar';
import { DEFAULT_MODE, type Mode } from '@/lib/modes';
import { DEFAULT_RESEARCH_DEPTH, type ResearchDepth } from '@/lib/research-depth';
import { PRECOMPUTED_DEMO_RUNS } from '@/lib/precomputed-demo-runs';
import type { Intent } from '@/modules/01-orchestrator';

const SUGGESTIONS = [
  'Does a polar aprotic solvent increase the rate of an SN2 reaction?',
  'Compare the evidence for CRISPR-Cas9 off-target rates at different guide RNA lengths.',
  'What does recent evidence say about horizontal gene transfer in antibiotic resistance?',
];

// 2026-11-01 (docs/DECISIONS.md): a suggestion with a precomputed entry skips the
// live pipeline entirely via `onSelectPrecomputed` — instant for a demo. A
// suggestion with no entry (or a stale one, if `SUGGESTIONS`'s text ever changes)
// falls through to the normal `onSend` live path unchanged — never a broken state.
export function EmptyState({
  onSend,
  onSelectPrecomputed,
}: {
  onSend: (text: string, mode: Mode, depth: ResearchDepth) => void;
  onSelectPrecomputed: (runId: string, freeText: string, mode: Mode, intent: Intent) => void;
}) {
  const [value, setValue] = useState('');
  const [mode, setMode] = useState<Mode>(DEFAULT_MODE);
  const [depth, setDepth] = useState<ResearchDepth>(DEFAULT_RESEARCH_DEPTH);

  function submit(text: string) {
    if (!text.trim()) return;
    const precomputed = PRECOMPUTED_DEMO_RUNS[text];
    if (precomputed) {
      onSelectPrecomputed(precomputed.runId, text, mode, precomputed.intent);
      return;
    }
    onSend(text, mode, depth);
  }

  return (
    <div className="mx-auto flex h-full w-full max-w-2xl flex-col items-center justify-center px-6 text-center">
      <h1 className="text-2xl font-medium text-fg">What would you like to understand?</h1>

      <div className="mt-8 w-full">
        <SearchBar value={value} onChange={setValue} mode={mode} onModeChange={setMode} depth={depth} onDepthChange={setDepth} onSubmit={() => submit(value)} autoFocus />
      </div>

      <div className="mt-5 flex flex-wrap justify-center gap-2">
        {SUGGESTIONS.map((suggestion) => (
          <button
            key={suggestion}
            type="button"
            onClick={() => submit(suggestion)}
            className="rounded-[var(--radius-chip)] border border-border px-3 py-1.5 text-xs text-muted transition-colors hover:border-border-strong hover:text-fg"
          >
            {suggestion}
          </button>
        ))}
      </div>
    </div>
  );
}
