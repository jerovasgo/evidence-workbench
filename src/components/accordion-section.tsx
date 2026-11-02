'use client';

import type { ReactNode } from 'react';

// 2026-11-02 (docs/DECISIONS.md): standardizes the "collapsed by default,
// research-surface card with a title + one-line description" pattern across the
// Evidence & Sources tab's four sections — previously only one of the four used
// this shape (the others weren't wrapped in a <details> at all, or defaulted open).

export function AccordionSection({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <details className="research-surface rounded-2xl p-4">
      <summary className="cursor-pointer select-none text-sm font-medium text-fg">{title}</summary>
      {description && <p className="mt-2 text-xs leading-5 text-muted">{description}</p>}
      <div className="mt-4">{children}</div>
    </details>
  );
}
