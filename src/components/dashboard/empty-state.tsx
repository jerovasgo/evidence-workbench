'use client';

import { useState } from 'react';
import { SearchBar } from '@/components/search-bar';
import { DEFAULT_MODE, type Mode } from '@/lib/modes';

const SUGGESTIONS = [
  'What is first-line management for suspected ACS?',
  'Compare guideline recommendations for NSTEMI antiplatelet therapy.',
  'What does recent evidence say about early reperfusion timing?',
];

export function EmptyState({ onSend }: { onSend: (text: string, mode: Mode) => void }) {
  const [value, setValue] = useState('');
  const [mode, setMode] = useState<Mode>(DEFAULT_MODE);

  function submit(text: string) {
    if (!text.trim()) return;
    onSend(text, mode);
  }

  return (
    <div className="mx-auto flex h-full w-full max-w-2xl flex-col items-center justify-center px-6 text-center">
      <h1 className="text-2xl font-medium text-fg">What would you like to understand?</h1>

      <div className="mt-8 w-full">
        <SearchBar value={value} onChange={setValue} mode={mode} onModeChange={setMode} onSubmit={() => submit(value)} autoFocus />
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
