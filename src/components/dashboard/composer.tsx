'use client';

import { useState } from 'react';
import { SearchBar } from '@/components/search-bar';
import { DEFAULT_MODE, type Mode } from '@/lib/modes';
import { DEFAULT_RESEARCH_DEPTH, type ResearchDepth } from '@/lib/research-depth';

export function Composer({ onSend, sending }: { onSend: (text: string, mode: Mode, depth: ResearchDepth) => void; sending: boolean }) {
  const [value, setValue] = useState('');
  const [mode, setMode] = useState<Mode>(DEFAULT_MODE);
  const [depth, setDepth] = useState<ResearchDepth>(DEFAULT_RESEARCH_DEPTH);

  function submit() {
    if (!value.trim() || sending) return;
    onSend(value, mode, depth);
    setValue('');
  }

  return (
    <div className="sticky bottom-0 mx-auto w-full max-w-3xl px-6 pb-6 pt-4">
      <SearchBar
        value={value}
        onChange={setValue}
        mode={mode}
        onModeChange={setMode}
        depth={depth}
        onDepthChange={setDepth}
        onSubmit={submit}
        loading={sending}
        placeholder="Ask a follow-up…"
        size="compact"
      />
    </div>
  );
}
