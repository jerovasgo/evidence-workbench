// 2026-10-28 conversational-flow brief, Etapa C: "el skeleton debe corresponder al
// modo seleccionado." Evidence is the only real output today (modules 06/07/08
// aren't built — docs/DECISIONS.md "single mode per query" policy), so this is the
// one skeleton shape that exists; it anticipates the claim-card list, not a
// placeholder for views that don't generate anything. `animate-pulse` is caught by
// globals.css's `prefers-reduced-motion` override (zero-duration under reduced
// motion), same as every other animation in the app.

export function EvidenceSkeleton() {
  return (
    <ul className="flex flex-col gap-3" role="status" aria-label="Gathering and verifying sources">
      {[0, 1, 2].map((i) => (
        <li key={i} aria-hidden="true" className="glass animate-pulse rounded-[var(--radius-card)] px-4 py-3">
          <div className="flex gap-2">
            <div className="h-5 w-16 rounded-[var(--radius-chip)] bg-border" />
            <div className="h-5 w-20 rounded-[var(--radius-chip)] bg-border" />
          </div>
          <div className="mt-3 h-3 w-full rounded bg-border" />
          <div className="mt-2 h-3 w-2/3 rounded bg-border" />
        </li>
      ))}
    </ul>
  );
}
