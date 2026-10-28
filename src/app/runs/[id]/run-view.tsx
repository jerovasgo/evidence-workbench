'use client';

import Link from 'next/link';
import { RunResult } from '@/components/run-result';

export function RunView({ runId }: { runId: string }) {
  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 px-6 py-10">
      <header className="flex items-center justify-between gap-4">
        <Link href="/" className="flex-shrink-0 text-sm text-muted hover:text-fg">
          &larr; New question
        </Link>
        {/* min-w-0 lets this flex item shrink below its content size so `truncate`
            can actually ellipsize a full run id on a narrow screen instead of
            wrapping and pushing the nav link onto its own line (found at 375px). */}
        <span className="min-w-0 truncate text-xs text-muted" title={runId}>
          {runId}
        </span>
      </header>

      <RunResult runId={runId} />
    </main>
  );
}
