'use client';

import { useState } from 'react';
import { SearchBar } from '@/components/search-bar';
import { DEFAULT_MODE, type Mode } from '@/lib/modes';

export function Composer({ onSend, sending }: { onSend: (text: string, mode: Mode) => void; sending: boolean }) {
  const [value, setValue] = useState('');
  const [mode, setMode] = useState<Mode>(DEFAULT_MODE);

  function submit() {
    if (!value.trim() || sending) return;
    onSend(value, mode);
    setValue('');
  }

  return (
    <div className="sticky bottom-0 mx-auto w-full max-w-3xl px-6 pb-6 pt-4">
      <SearchBar
        value={value}
        onChange={setValue}
        mode={mode}
        onModeChange={setMode}
        onSubmit={submit}
        loading={sending}
        placeholder="Ask a follow-up…"
        size="compact"
      />
    </div>
  );
}
