'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { RunResult } from '@/components/run-result';
import type { Intent } from '@/modules/01-orchestrator';

export function RunView({ runId }: { runId: string }) {
  // 2026-11-02 (docs/DECISIONS.md): without this, reloading or sharing a link to an
  // Algorithm/Mechanism/Evidence Map run always lost that view — `RunResult` was
  // given no `intent` at all, so its mode/intent precedence logic had nothing to
  // work with. `run.intent` is now authoritative (mode determines it directly at
  // creation time), so fetching it here is sufficient — no separate `mode` needed.
  const [intent, setIntent] = useState<Intent | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    void fetch(`/api/runs/${runId}`, { signal: controller.signal })
      .then((res) => (res.ok ? res.json() : null))
      .then((body) => { if (body?.run?.intent) setIntent(body.run.intent as Intent); })
      .catch(() => undefined);
    return () => controller.abort();
  }, [runId]);

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

      <RunResult runId={runId} intent={intent} />
    </main>
  );
}
