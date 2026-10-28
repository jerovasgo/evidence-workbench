'use client';

import { useState } from 'react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { ChevronLeft, ChevronRight, MoreHorizontal, Pencil, Plus, Settings, Trash2 } from 'lucide-react';
import { cn } from '@/lib/cn';
import { groupByPeriod } from '@/lib/group-by-period';
import type { ConversationSummary } from '@/lib/use-conversations';

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

  if (collapsed) {
    return (
      <div className="flex h-full w-14 flex-col items-center gap-4 border-r border-border bg-bg py-4">
        <button type="button" onClick={() => setCollapsed(false)} aria-label="Expand sidebar" className="text-muted hover:text-fg">
          <ChevronRight className="h-4 w-4" />
        </button>
        <button type="button" onClick={onNew} aria-label="New research" className="text-muted hover:text-fg">
          <Plus className="h-4 w-4" />
        </button>
      </div>
    );
  }

  return (
    <div className="flex h-full w-72 flex-shrink-0 flex-col border-r border-border bg-bg">
      <div className="flex items-center justify-between px-4 py-4">
        <span className="text-sm font-semibold text-fg">Evidence Workbench</span>
        <button type="button" onClick={() => setCollapsed(true)} aria-label="Collapse sidebar" className="text-muted hover:text-fg">
          <ChevronLeft className="h-4 w-4" />
        </button>
      </div>

      <div className="px-3">
        <button
          type="button"
          onClick={onNew}
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
                        onClick={() => onSelect(conversation.id)}
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
                          <DropdownMenu.Content align="start" className="glass z-50 w-40 rounded-[var(--radius-chip)] p-1 text-left">
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
  );
}
