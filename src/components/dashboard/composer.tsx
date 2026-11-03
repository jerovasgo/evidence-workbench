'use client';

import { useState } from 'react';
import { SearchBar } from '@/components/search-bar';
import type { Mode } from '@/lib/modes';
import type { ResearchDepth } from '@/lib/research-depth';

// 2026-11-02 (docs/DECISIONS.md): mode/depth are controlled from `useConversations`'s
// lifted state, not owned locally — this component previously reset to the defaults
// every time the dashboard swapped from `EmptyState` to `Composer` (a fresh mount),
// silently discarding whatever the user picked on the landing page or a prior turn.
export function Composer({
  onSend,
  sending,
  mode,
  depth,
  onModeChange,
  onDepthChange,
}: {
  onSend: (text: string, mode: Mode, depth: ResearchDepth) => void;
  sending: boolean;
  mode: Mode;
  depth: ResearchDepth;
  onModeChange: (mode: Mode) => void;
  onDepthChange: (depth: ResearchDepth) => void;
}) {
  const [value, setValue] = useState('');

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
        onModeChange={onModeChange}
        depth={depth}
        onDepthChange={onDepthChange}
        onSubmit={submit}
        loading={sending}
        placeholder="Ask a follow-up…"
        size="compact"
      />
    </div>
  );
}
