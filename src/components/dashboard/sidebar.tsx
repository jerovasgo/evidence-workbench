'use client';

import { useState } from 'react';
import { Menu, Plus, Settings, X } from 'lucide-react';

// Mobile (<768px, Tailwind's `md`): the sidebar is off-canvas by default — a fixed
// 288px drawer sliding in over a backdrop, opened via a fixed hamburger trigger,
// closed on backdrop tap / Escape / starting new research.
//
// 2026-10-31 (docs/DECISIONS.md): no conversation list, rename or delete here
// anymore — no real login exists yet, so nothing is persisted to list (every
// question is anonymous and gone once the tab closes). "New research" clears the
// live thread in place; the sidebar is otherwise just the logo and settings entry.

export function Sidebar({ onNew }: { onNew: () => void }) {
  const [mobileOpen, setMobileOpen] = useState(false);

  function newAndClose() {
    onNew();
    setMobileOpen(false);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setMobileOpen(true)}
        aria-label="Open menu"
        className="popover fixed left-4 top-4 z-30 flex h-9 w-9 items-center justify-center rounded-[var(--radius-pill)] text-fg md:hidden"
      >
        <Menu className="h-4 w-4" aria-hidden="true" />
      </button>

      {mobileOpen && (
        <div
          role="presentation"
          onClick={() => setMobileOpen(false)}
          className="fixed inset-0 z-40 bg-black/60 motion-safe:animate-in motion-safe:fade-in md:hidden"
        />
      )}

      <div
        className={`fixed inset-y-0 left-0 z-50 h-full w-72 border-r border-border bg-bg transition-transform duration-200 ease-out ${mobileOpen ? 'translate-x-0' : '-translate-x-full'} md:static md:z-auto md:w-56 md:translate-x-0 md:transition-none`}
      >
        <div className="flex h-full flex-col">
          <div className="flex items-center justify-between px-4 py-4">
            <span className="text-sm font-semibold text-fg">Evidence Workbench</span>
            <button type="button" onClick={() => setMobileOpen(false)} aria-label="Close menu" className="text-muted hover:text-fg md:hidden">
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="px-3">
            <button
              type="button"
              onClick={newAndClose}
              className="flex w-full items-center gap-2 rounded-[var(--radius-chip)] border border-border-strong px-3 py-2 text-sm text-fg transition-colors hover:bg-glass-strong"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              New research
            </button>
          </div>

          <div className="flex-1" />

          <div className="border-t border-border px-4 py-3">
            <button type="button" className="flex items-center gap-2 text-xs text-muted hover:text-fg">
              <Settings className="h-3.5 w-3.5" aria-hidden="true" />
              Settings & profile
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
