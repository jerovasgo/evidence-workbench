'use client';

import * as Dialog from '@radix-ui/react-dialog';
import type { Claim } from '@/shared/domain';
import { Chip } from '@/components/ui/chip';

// SPEC §11 screen (3): Evidence drawer — "provenance always one click away."

export function EvidenceDrawer({ claim, onClose }: { claim: Claim | null; onClose: () => void }) {
  return (
    <Dialog.Root open={claim !== null} onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/60 motion-safe:animate-in motion-safe:fade-in" />
        <Dialog.Content className="fixed inset-y-0 right-0 flex w-full max-w-md flex-col gap-4 overflow-y-auto border-l border-border bg-surface p-6 focus:outline-none">
          {claim && (
            <>
              <div className="flex items-start justify-between gap-4">
                <Dialog.Title className="text-base font-medium text-fg">Evidence</Dialog.Title>
                <Dialog.Close className="text-muted hover:text-fg" aria-label="Close evidence drawer">
                  &times;
                </Dialog.Close>
              </div>

              <Dialog.Description className="text-sm text-fg">{claim.text}</Dialog.Description>

              <div className="flex flex-wrap gap-2">
                <Chip tone="warning">Not confirmed — pending clinical support review</Chip>
                {claim.verification.quoteFound && <Chip>Quote verified verbatim</Chip>}
                {claim.verification.retracted && <Chip tone="conflict">Source retracted</Chip>}
              </div>

              <div className="rounded-[var(--radius-card)] border border-border bg-bg p-4">
                <p className="text-xs uppercase tracking-wide text-muted">Verbatim quote</p>
                <blockquote className="mt-2 font-mono text-sm text-fg">&ldquo;{claim.quote}&rdquo;</blockquote>
              </div>

              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
                <dt className="text-muted">Source</dt>
                <dd className="truncate text-fg">{claim.sourceId}</dd>
                <dt className="text-muted">Locator</dt>
                <dd className="text-fg">{claim.passageId}</dd>
                <dt className="text-muted">Grade</dt>
                <dd className="text-fg">
                  {claim.grade.certainty} ({claim.grade.origin === 'source' ? 'from source' : 'AI-estimated'})
                </dd>
              </dl>
            </>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
