/** Animated placeholder for the progressive source-to-finding visualization. */
export function EvidenceSkeleton() {
  return <div role="status" aria-label="Building evidence visualization" className="rounded-[var(--radius-card)] border border-border bg-black/30 p-4">
    <div className="h-3 w-36 animate-pulse rounded bg-border" />
    <div className="mt-4 overflow-hidden rounded-lg border border-border/60 bg-[#090909] p-4">
      <svg viewBox="0 0 700 190" className="w-full" aria-hidden="true">
        <path className="evidence-loading-path" d="M 180 43 C 270 43, 300 46, 370 46 M 180 95 C 270 95, 300 95, 370 95 M 180 147 C 270 147, 300 144, 370 144" fill="none" stroke="#8d8d8d" strokeWidth="2" />
        {[40, 92, 144].map((y) => <g key={y} className="evidence-loading-node"><rect x="22" y={y - 18} width="158" height="38" rx="9" fill="#171717" stroke="#888" strokeOpacity=".35" /><rect x="370" y={y - 18} width="270" height="38" rx="9" fill="#171717" stroke="#888" strokeOpacity=".35" /></g>)}
      </svg>
    </div>
    <p className="mt-3 text-xs text-muted">Building the evidence view as sources arrive…</p>
  </div>;
}
