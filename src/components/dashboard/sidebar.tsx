'use client';

import { useState } from 'react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { ChevronLeft, ChevronRight, Menu, MoreHorizontal, Pencil, Plus, Settings, Trash2, X } from 'lucide-react';
import { cn } from '@/lib/cn';
import { groupByPeriod } from '@/lib/group-by-period';
import type { ConversationSummary } from '@/lib/use-conversations';

// Mobile (<768px, Tailwind's `md`): the sidebar is off-canvas by default — a fixed
// 288px drawer sliding in over a backdrop, opened via a fixed hamburger trigger,
// closed on backdrop tap / Escape / picking a conversation / starting new research.
// `collapsed` (the desktop icon-rail toggle) only ever applies at `md:` and up —
// below that the drawer always shows full content when open, never the narrow rail
// (a permanently-visible icon strip makes no sense on a screen this size). Both
// states are independent and controlled entirely by CSS breakpoints, no JS media
// query: 2026-10-28, found live-testing at 375px — the sidebar previously had no
// mobile treatment at all and permanently ate ~80% of the viewport.

export function Sidebar({
  conversations,
  activeConversationId,
  onSelect,
  onNew,
  onRename,
  onDelete,
}: {
  conversations: ConversationSummary[];
  activeConversationId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onRename: (id: string, title: string) => void;
  onDelete: (id: string) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState('');
  const groups = groupByPeriod(conversations);

  function startRename(conversation: ConversationSummary) {
    setRenamingId(conversation.id);
    setDraftTitle(conversation.title);
  }

  function commitRename() {
    if (renamingId && draftTitle.trim()) onRename(renamingId, draftTitle.trim());
    setRenamingId(null);
  }

  function selectAndClose(id: string) {
    onSelect(id);
    setMobileOpen(false);
  }

  function newAndClose() {
    onNew();
    setMobileOpen(false);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setMobileOpen(true)}
        aria-label="Open conversation history"
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
        className={cn(
          'fixed inset-y-0 left-0 z-50 h-full w-72 border-r border-border bg-bg transition-transform duration-200 ease-out',
          mobileOpen ? 'translate-x-0' : '-translate-x-full',
          'md:static md:z-auto md:translate-x-0 md:transition-none',
          collapsed && 'md:w-14',
        )}
      >
        {/* Full content: always what mobile shows when open, and the desktop-expanded view. */}
        <div className={cn('flex h-full flex-col', collapsed && 'md:hidden')}>
          <div className="flex items-center justify-between px-4 py-4">
            <span className="text-sm font-semibold text-fg">Evidence Workbench</span>
            <button type="button" onClick={() => setMobileOpen(false)} aria-label="Close conversation history" className="text-muted hover:text-fg md:hidden">
              <X className="h-4 w-4" />
            </button>
            <button type="button" onClick={() => setCollapsed(true)} aria-label="Collapse sidebar" className="hidden text-muted hover:text-fg md:block">
              <ChevronLeft className="h-4 w-4" />
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

          <nav className="mt-4 flex-1 overflow-y-auto px-3" aria-label="Conversation history">
            {groups.length === 0 && <p className="px-2 py-4 text-xs text-muted">No research yet.</p>}
            {groups.map((group) => (
              <div key={group.label} className="mb-4">
                <p className="px-2 pb-1 text-xs text-muted-2">{group.label}</p>
                <ul className="flex flex-col gap-0.5">
                  {group.items.map((conversation) => (
                    <li key={conversation.id} className="group/item relative">
                      {renamingId === conversation.id ? (
                        <input
                          autoFocus
                          value={draftTitle}
                          onChange={(e) => setDraftTitle(e.target.value)}
                          onBlur={commitRename}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') commitRename();
                            if (e.key === 'Escape') setRenamingId(null);
                          }}
                          className="w-full rounded-[var(--radius-chip)] border border-border-strong bg-transparent px-2 py-1.5 text-sm text-fg focus:outline-none"
                        />
                      ) : (
                        <div
                          className={cn(
                            'flex w-full items-center justify-between gap-2 rounded-[var(--radius-chip)] text-sm transition-colors',
                            conversation.id === activeConversationId ? 'bg-glass-strong text-fg' : 'text-muted hover:bg-glass hover:text-fg',
                          )}
                        >
                          <button
                            type="button"
                            onClick={() => selectAndClose(conversation.id)}
                            className="min-w-0 flex-1 truncate px-2 py-1.5 text-left"
                          >
                            {conversation.title}
                          </button>
                          {/* A sibling button, not nested inside the one above — nested
                              <button>s are invalid HTML and make the dropdown's clicks
                              unreliable (discovered live-testing this exact menu). */}
                          <DropdownMenu.Root>
                            <DropdownMenu.Trigger asChild>
                              <button
                                type="button"
                                aria-label="Conversation options"
                                className="flex-shrink-0 px-2 py-1.5 opacity-0 group-hover/item:opacity-100 focus-visible:opacity-100"
                              >
                                <MoreHorizontal className="h-3.5 w-3.5" />
                              </button>
                            </DropdownMenu.Trigger>
                            <DropdownMenu.Portal>
                              <DropdownMenu.Content align="start" className="popover z-50 w-40 rounded-[var(--radius-chip)] p-1 text-left">
                                <DropdownMenu.Item
                                  onSelect={() => startRename(conversation)}
                                  className="flex cursor-pointer items-center gap-2 rounded-[var(--radius-chip)] px-2 py-1.5 text-xs text-fg outline-none data-[highlighted]:bg-glass-strong"
                                >
                                  <Pencil className="h-3 w-3" /> Rename
                                </DropdownMenu.Item>
                                <DropdownMenu.Item
                                  onSelect={() => onDelete(conversation.id)}
                                  className="flex cursor-pointer items-center gap-2 rounded-[var(--radius-chip)] px-2 py-1.5 text-xs text-conflict outline-none data-[highlighted]:bg-glass-strong"
                                >
                                  <Trash2 className="h-3 w-3" /> Delete
                                </DropdownMenu.Item>
                              </DropdownMenu.Content>
                            </DropdownMenu.Portal>
                          </DropdownMenu.Root>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>

          <div className="border-t border-border px-4 py-3">
            <button type="button" className="flex items-center gap-2 text-xs text-muted hover:text-fg">
              <Settings className="h-3.5 w-3.5" aria-hidden="true" />
              Settings & profile
            </button>
          </div>
        </div>

        {/* Desktop-only icon rail, shown instead of the full content when collapsed — never on mobile. */}
        {collapsed && (
          <div className="hidden h-full flex-col items-center gap-4 py-4 md:flex">
            <button type="button" onClick={() => setCollapsed(false)} aria-label="Expand sidebar" className="text-muted hover:text-fg">
              <ChevronRight className="h-4 w-4" />
            </button>
            <button type="button" onClick={onNew} aria-label="New research" className="text-muted hover:text-fg">
              <Plus className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>
    </>
  );
}
