import { Link2, GitBranch, TriangleAlert } from 'lucide-react';

// Only claims features that are actually implemented, per the brief's own §6
// instruction — each point maps to a real, already-built mechanism (see the
// linked modules), not an aspirational capability.

const POINTS = [
  {
    icon: Link2,
    title: 'Trace claims to source text',
    description: 'Source quotations are checked against retrieved text, giving you a trail back to the evidence.',
  },
  {
    icon: GitBranch,
    title: 'Keep the research context',
    description: 'Follow findings back to their publications and inspect the context behind the claim.',
  },
  {
    icon: TriangleAlert,
    title: 'Uncertainty is shown, not hidden',
    description: 'A matching quote shows what a source says; it does not establish that a claim is true.',
  },
];

export function EvidenceTrust() {
  return (
    <section className="mx-auto max-w-4xl px-6 py-28">
      <h2 className="text-center text-3xl font-semibold tracking-tight text-fg sm:text-4xl">Evidence you can inspect.</h2>
      <p className="mx-auto mt-4 max-w-xl text-center text-base text-muted">
        Move beyond a generated answer. Follow the evidence, examine its context, and see what remains uncertain.
      </p>

      <div className="mt-16 grid grid-cols-1 gap-10 sm:grid-cols-3">
        {POINTS.map((point) => (
          <div key={point.title} className="flex flex-col gap-3">
            <point.icon className="h-5 w-5 text-[#8debdc]" aria-hidden="true" />
            <h3 className="text-sm font-medium text-fg">{point.title}</h3>
            <p className="text-sm text-muted">{point.description}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
