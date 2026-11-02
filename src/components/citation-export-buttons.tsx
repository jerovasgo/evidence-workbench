'use client';

import { toBibTeX, toRis, type CitationSource } from '@/lib/citation-export';

// 2026-11-02 (docs/DECISIONS.md): citation export, built entirely client-side from
// data already streamed (`sourceCatalog` + the verified claims that reference it) —
// no new SSE event, no new network call. Only offers sources with at least one
// verified claim: "what I can actually cite," not the full candidate pool.

function download(filename: string, content: string): void {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function CitationExportButtons({ sources }: { sources: CitationSource[] }) {
  if (sources.length === 0) return null;

  return (
    <div className="mt-3 flex flex-wrap gap-3 text-xs">
      <button type="button" className="underline underline-offset-4" onClick={() => download('citations.bib', toBibTeX(sources))}>
        Export citations (.bib)
      </button>
      <button type="button" className="underline underline-offset-4" onClick={() => download('citations.ris', toRis(sources))}>
        Export citations (.ris)
      </button>
    </div>
  );
}
