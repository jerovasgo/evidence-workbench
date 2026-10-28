'use client';

import * as Dialog from '@radix-ui/react-dialog';
import type { Claim } from '@/shared/domain';
import { Chip } from '@/components/ui/chip';
import { gradeOriginLabel, gradeSummaryLabel } from '@/lib/i18n/grade-labels';

// SPEC §11 screen (3): Evidence drawer — "provenance always one click away."

const SUPPORT_CHIP: Record<Claim['verification']['support'], { label: string; tone: 'default' | 'warning' }> = {
  supports: { label: 'Verified by support-judge', tone: 'default' },
  partial: { label: 'Partial support — see caveat below', tone: 'warning' },
  unknown: { label: 'Not confirmed — support review inconclusive', tone: 'warning' },
  no: { label: 'Not confirmed', tone: 'warning' }, // unreachable: a 'no' verdict drops the claim before it gets here
};

const ISSUE_LABEL: Record<string, string> = {
  negation: 'Negation mismatch',
  wrong_population: 'Population mismatch',
  wrong_threshold: 'Threshold mismatch',
  wrong_strength: 'Strength mismatch',
  out_of_context: 'Out of context',
  other: 'Other mismatch',
};

export function EvidenceDrawer({ claim, onClose }: { claim: Claim | null; onClose: () => void }) {
  return (
    <Dialog.Root open={claim !== null} onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/60 motion-safe:animate-in motion-safe:fade-in" />
        <Dialog.Content className="glass fixed inset-y-0 right-0 flex w-full max-w-md flex-col gap-4 overflow-y-auto border-y-0 border-r-0 p-6 focus:outline-none">
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
                <Chip tone={SUPPORT_CHIP[claim.verification.support].tone}>{SUPPORT_CHIP[claim.verification.support].label}</Chip>
                {claim.verification.quoteFound && <Chip>Quote verified verbatim</Chip>}
                {claim.verification.retracted && <Chip tone="conflict">Source retracted</Chip>}
              </div>

              {(claim.verification.supportNote || claim.verification.supportIssues) && (
                <div className="rounded-[var(--radius-card)] border border-warning/40 bg-black/40 p-4">
                  <p className="text-xs uppercase tracking-wide text-warning">Support caveat</p>
                  {claim.verification.supportIssues && claim.verification.supportIssues.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {claim.verification.supportIssues.map((issue) => (
                        <Chip key={issue} tone="warning">
                          {ISSUE_LABEL[issue] ?? issue}
                        </Chip>
                      ))}
                    </div>
                  )}
                  {claim.verification.supportNote && <p className="mt-2 text-sm text-fg">{claim.verification.supportNote}</p>}
                </div>
              )}

              <div className="rounded-[var(--radius-card)] border border-border bg-black/40 p-4">
                <p className="text-xs uppercase tracking-wide text-muted">Verbatim quote</p>
                <blockquote className="mt-2 text-sm italic text-fg">&ldquo;{claim.quote}&rdquo;</blockquote>
              </div>

              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
                <dt className="text-muted">Source</dt>
                <dd className="truncate text-fg">{claim.sourceId}</dd>
                <dt className="text-muted">Locator</dt>
                <dd className="text-fg">{claim.passageId}</dd>
                <dt className="text-muted">Grade</dt>
                <dd className="text-fg">
                  {gradeSummaryLabel(claim.grade)} — {gradeOriginLabel(claim.grade)}
                </dd>
              </dl>
            </>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
