'use client';

import type { Claim } from '@/shared/domain';
import { CertaintyPips, Chip, OriginBadge } from '@/components/ui/chip';

// `verification.support` is always 'unknown' today — module 03's
// support-judge agent isn't built (SECURITY.md) — so this is deliberately never
// presented as "verified": CLAUDE.md rule 5 ("no unverified but shown" state) means
// every claim here carries a visible "Not confirmed" chip, exactly matching
// docs/architecture/03's own rule for an unknown-support claim ("available only in
// the evidence drawer, marked 'not confirmed'").

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
          <Chip tone="warning">Not confirmed</Chip>
          <OriginBadge origin={claim.grade.origin} />
          <CertaintyPips certainty={claim.grade.certainty} />
        </div>
        <p className="mt-2 text-sm text-fg">{claim.text}</p>
        <p className="mt-1 truncate text-xs text-muted">View evidence &rsaquo;</p>
      </button>
    </li>
  );
}
