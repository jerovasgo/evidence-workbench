// 2026-11-02 (docs/DECISIONS.md): replaces the old flow-diagram skeleton and the
// bare pulse bars with one minimalist, continuous animation — two strands unfurl
// into an elongated double helix, curl into a compact coil, then unroll and
// restart. Pure inline SVG + CSS `@keyframes` (transform-based, not SMIL path-
// morphing — cheaper and more robust for a looping 3-phase cycle), monochrome
// (`--color-fg`/`--color-muted`), no new dependency. The global
// `prefers-reduced-motion` catch-all (globals.css) already zeroes every animation
// here for free. Stops automatically: it's simply not rendered once a run finishes
// (the caller's own conditional), never an explicit stop/start toggle.

export function DnaLoader({ size = 'default', caption }: { size?: 'compact' | 'default'; caption?: string }) {
  const height = size === 'compact' ? 36 : 64;
  return (
    <div role="status" aria-label={caption ?? 'Working'} className="flex flex-col items-center gap-2">
      <svg viewBox="0 0 240 60" className="dna-loader" style={{ height, width: 'auto' }} aria-hidden="true">
        <g className="dna-loader-cycle">
          <path className="dna-loader-strand dna-loader-strand-a" d="M 0 30 C 20 6, 40 6, 60 30 S 100 54, 120 30 S 160 6, 180 30 S 220 54, 240 30" fill="none" stroke="var(--color-fg)" strokeWidth="2.5" strokeLinecap="round" />
          <path className="dna-loader-strand dna-loader-strand-b" d="M 0 30 C 20 54, 40 54, 60 30 S 100 6, 120 30 S 160 54, 180 30 S 220 6, 240 30" fill="none" stroke="var(--color-muted)" strokeWidth="2.5" strokeLinecap="round" />
          {[20, 60, 100, 140, 180, 220].map((x, i) => (
            <line key={x} className="dna-loader-rung" style={{ animationDelay: `${i * 0.15}s` }} x1={x} y1={30 - 16 * Math.sin((x / 40) * Math.PI)} x2={x} y2={30 + 16 * Math.sin((x / 40) * Math.PI)} stroke="var(--color-border-strong)" strokeWidth="1.5" />
          ))}
        </g>
      </svg>
      {caption && <p className="text-xs text-muted">{caption}</p>}
    </div>
  );
}
