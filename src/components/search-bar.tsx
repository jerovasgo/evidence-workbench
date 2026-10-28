'use client';

import { useRef, type KeyboardEvent } from 'react';
import { ArrowUp } from 'lucide-react';
import { ModeSelector } from '@/components/mode-selector';
import { cn } from '@/lib/cn';
import type { Mode } from '@/lib/modes';

// Shared between the landing hero and the dashboard composer — "the barra must feel
// like the most important component in the whole interface." Enter submits,
// Shift+Enter inserts a newline; supports multi-line queries.

export interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
  mode: Mode;
  onModeChange: (mode: Mode) => void;
  onSubmit: () => void;
  placeholder?: string;
  loading?: boolean;
  disabled?: boolean;
  autoFocus?: boolean;
  size?: 'hero' | 'compact';
}

export function SearchBar({
  value,
  onChange,
  mode,
  onModeChange,
  onSubmit,
  placeholder = 'Ask anything. Explore the connections.',
  loading = false,
  disabled = false,
  autoFocus = false,
  size = 'hero',
}: SearchBarProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const canSubmit = value.trim().length > 0 && !loading && !disabled;

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (canSubmit) onSubmit();
    }
  }

  return (
    <div className={cn('glass w-full rounded-[var(--radius-card)] p-3', size === 'hero' ? 'p-4' : 'p-3')}>
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        rows={size === 'hero' ? 3 : 1}
        maxLength={1500}
        autoFocus={autoFocus}
        disabled={disabled}
        aria-label={placeholder}
        className={cn(
          'w-full resize-none bg-transparent text-fg placeholder:text-muted-2 focus:outline-none',
          size === 'hero' ? 'text-base' : 'text-sm',
        )}
      />
      <div className="mt-2 flex items-center justify-between">
        <ModeSelector mode={mode} onChange={onModeChange} />
        <button
          type="button"
          onClick={onSubmit}
          disabled={!canSubmit}
          aria-label="Submit"
          className="flex h-8 w-8 items-center justify-center rounded-full bg-fg text-bg transition-opacity disabled:cursor-not-allowed disabled:opacity-30"
        >
          <ArrowUp className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
