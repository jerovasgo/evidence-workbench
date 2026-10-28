'use client';

import type { Claim } from '@/shared/domain';
import { CertaintyPips, Chip } from '@/components/ui/chip';
import { NOT_GRADED_TOOLTIP, gradeStrengthLabel } from '@/lib/i18n/grade-labels';

// `verification.support` now reflects a real support-judge (P10, module 03) verdict.
// Only 'supports' gets a non-caveated chip — CLAUDE.md rule 5 ("no unverified but
// shown" state) and docs/architecture/03's own rule mean 'partial' always shows its
// caveat and 'unknown' still reads as "Not confirmed" (the judge couldn't decide, or
// its call failed/timed out — both honest, not a hidden failure).
//
// Grade: 2026-10-28 "no AI-inferred grades" policy (docs/DECISIONS.md) — certainty
// only ever shows when it traces to a recognized printed grade; otherwise a neutral
// "Not graded" tag, never a number the system produced itself. Strength is shown
// independently of certainty (it can be known even when certainty isn't).

const SUPPORT_CHIP: Record<Claim['verification']['support'], { label: string; tone: 'default' | 'warning' }> = {
  supports: { label: 'Verified', tone: 'default' },
  partial: { label: 'Partial support', tone: 'warning' },
  unknown: { label: 'Not confirmed', tone: 'warning' },
  no: { label: 'Not confirmed', tone: 'warning' }, // unreachable: a 'no' verdict drops the claim before it gets here
};

const ACTION_LABEL: Record<Claim['actionType'], string> = {
  assess: 'Assess',
  test: 'Test',
  treat: 'Treat',
  threshold: 'Threshold',
  disposition: 'Disposition',
  avoid: 'Avoid',
  mechanism: 'Mechanism',
};

export function ClaimCard({ claim, onOpenEvidence }: { claim: Claim; onOpenEvidence: (claim: Claim) => void }) {
  const supportChip = SUPPORT_CHIP[claim.verification.support];
  return (
    <li>
      <button
        type="button"
        onClick={() => onOpenEvidence(claim)}
        className="glass w-full rounded-[var(--radius-card)] px-4 py-3 text-left transition-colors duration-150 hover:border-border-strong"
      >
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <Chip>{ACTION_LABEL[claim.actionType]}</Chip>
          {claim.safetyCritical && <Chip tone="conflict">Safety-critical</Chip>}
          <Chip tone={supportChip.tone}>{supportChip.label}</Chip>
          {claim.grade.certainty === 'ungraded' ? (
            <Chip title={NOT_GRADED_TOOLTIP}>Not graded</Chip>
          ) : (
            <>
              <Chip>From source</Chip>
              <CertaintyPips certainty={claim.grade.certainty} />
            </>
          )}
          {claim.grade.strength && <Chip>{gradeStrengthLabel(claim.grade.strength)}</Chip>}
        </div>
        <p className="mt-2 text-sm text-fg">{claim.text}</p>
        <p className="mt-1 truncate text-xs text-muted">View evidence &rsaquo;</p>
      </button>
    </li>
  );
}
