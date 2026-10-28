import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export function Chip({
  children,
  tone = 'default',
  className,
  title,
}: {
  children: ReactNode;
  tone?: 'default' | 'warning' | 'conflict';
  className?: string;
  /** Native hover hint — a progressive enhancement only; the full explanation must always also appear in visible text somewhere reachable without hover (e.g. the evidence drawer), never hover-only. */
  title?: string;
}) {
  return (
    <span
      title={title}
      className={cn(
        'inline-flex items-center gap-1 rounded-[var(--radius-chip)] border px-2 py-0.5 text-xs',
        tone === 'default' && 'border-border text-muted',
        tone === 'warning' && 'border-warning/40 text-warning',
        tone === 'conflict' && 'border-conflict/40 text-conflict',
        className,
      )}
    >
      {children}
    </span>
  );
}

/** Certainty as a 4-pip luminance ramp, always paired with a text label — never color alone. */
export function CertaintyPips({ certainty }: { certainty: 'high' | 'moderate' | 'low' | 'very_low' | 'ungraded' }) {
  const filled = { high: 4, moderate: 3, low: 2, very_low: 1, ungraded: 0 }[certainty];
  const label = { high: 'High', moderate: 'Moderate', low: 'Low', very_low: 'Very low', ungraded: 'Not graded' }[certainty];

  return (
    <span className="inline-flex items-center gap-1.5" aria-label={`Certainty: ${label}`}>
      <span className="flex gap-0.5" aria-hidden="true">
        {Array.from({ length: 4 }, (_, i) => (
          <span
            key={i}
            className={cn('h-1.5 w-1.5 rounded-full', i < filled ? 'bg-fg' : 'bg-border')}
            style={i < filled ? { opacity: 0.4 + (i / 3) * 0.6 } : undefined}
          />
        ))}
      </span>
      <span className="text-xs text-muted">{label}</span>
    </span>
  );
}
