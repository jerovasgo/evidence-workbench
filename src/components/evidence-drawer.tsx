'use client';

import * as Dialog from '@radix-ui/react-dialog';
import type { Claim } from '@/shared/domain';
import type { ScoreBreakdown } from '@/modules/04-grading-scoring';
import { Chip } from '@/components/ui/chip';
import { NOT_GRADED_TOOLTIP, gradeCertaintyLabel, gradeProvenanceLabel, gradeStrengthLabel } from '@/lib/i18n/grade-labels';

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

export function EvidenceDrawer({
  claim,
  sourceScore,
  onClose,
}: {
  claim: Claim | null;
  /** Module 04 Part B — the claim's source score breakdown, when the run computed one. */
  sourceScore?: ScoreBreakdown | null;
  onClose: () => void;
}) {
  return (
    <Dialog.Root open={claim !== null} onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/60 motion-safe:animate-in motion-safe:fade-in" />
        <Dialog.Content className="popover fixed inset-y-0 right-0 flex w-full max-w-md flex-col gap-4 overflow-y-auto border-y-0 border-r-0 p-6 focus:outline-none">
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
                <dt className="text-muted">Certainty</dt>
                <dd className="text-fg">
                  {gradeCertaintyLabel(claim.grade)}
                  {claim.grade.certainty === 'ungraded' && <span className="mt-0.5 block text-muted">{NOT_GRADED_TOOLTIP}</span>}
                </dd>
                {claim.grade.strength && (
                  <>
                    <dt className="text-muted">Strength</dt>
                    <dd className="text-fg">{gradeStrengthLabel(claim.grade.strength)}</dd>
                  </>
                )}
                {gradeProvenanceLabel(claim.grade) && (
                  <>
                    <dt className="text-muted">Source grade</dt>
                    <dd className="text-fg">{gradeProvenanceLabel(claim.grade)}</dd>
                  </>
                )}
              </dl>

              {sourceScore && (
                <div className="rounded-[var(--radius-card)] border border-border bg-black/40 p-4">
                  <p className="text-xs uppercase tracking-wide text-muted">Source score — why ranked here</p>
                  <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
                    <dt className="text-muted">Relevance</dt>
                    <dd className="text-fg">{sourceScore.relevance.toFixed(2)} (not yet modeled — placeholder)</dd>
                    <dt className="text-muted">Evidence level</dt>
                    <dd className="text-fg">{sourceScore.level.toFixed(2)}</dd>
                    <dt className="text-muted">Quality</dt>
                    <dd className="text-fg">{sourceScore.quality.toFixed(2)}</dd>
                    <dt className="text-muted">Currency</dt>
                    <dd className="text-fg">{sourceScore.currency.toFixed(2)}</dd>
                    <dt className="text-muted">Applicability</dt>
                    <dd className="text-fg">
                      {sourceScore.applicability.toFixed(2)} ({sourceScore.applicabilityLabel})
                    </dd>
                    <dt className="text-muted">Total</dt>
                    <dd className="text-fg">{sourceScore.total.toFixed(2)}</dd>
                  </dl>
                </div>
              )}
            </>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
