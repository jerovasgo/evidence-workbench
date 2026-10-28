'use client';

import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { Check, ChevronDown } from 'lucide-react';
import { MODE_OPTIONS, type Mode } from '@/lib/modes';
import { cn } from '@/lib/cn';

export function ModeSelector({ mode, onChange }: { mode: Mode; onChange: (mode: Mode) => void }) {
  const active = MODE_OPTIONS.find((m) => m.value === mode) ?? MODE_OPTIONS[0]!;

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-1.5 rounded-[var(--radius-pill)] border border-border-strong px-3 py-1.5 text-xs text-muted transition-colors hover:text-fg"
        >
          {active.label}
          <ChevronDown className="h-3 w-3" aria-hidden="true" />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="start"
          sideOffset={8}
          className="glass z-50 w-72 rounded-[var(--radius-card)] p-1.5 shadow-none"
        >
          {MODE_OPTIONS.map((option) => (
            <DropdownMenu.Item
              key={option.value}
              onSelect={() => onChange(option.value)}
              className={cn(
                'flex cursor-pointer flex-col gap-0.5 rounded-[var(--radius-chip)] px-3 py-2 text-sm outline-none transition-colors',
                'data-[highlighted]:bg-glass-strong',
              )}
            >
              <span className="flex items-center justify-between text-fg">
                {option.label}
                {option.value === mode && <Check className="h-3.5 w-3.5" aria-hidden="true" />}
              </span>
              <span className="text-xs text-muted">{option.description}</span>
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
