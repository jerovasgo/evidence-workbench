'use client';

import Link from 'next/link';
import { RunResult } from '@/components/run-result';

export function RunView({ runId }: { runId: string }) {
  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 px-6 py-10">
      <header className="flex items-center justify-between">
        <Link href="/" className="text-sm text-muted hover:text-fg">
          &larr; New question
        </Link>
        <span className="text-xs text-muted">{runId}</span>
      </header>

      <RunResult runId={runId} />
    </main>
  );
}
