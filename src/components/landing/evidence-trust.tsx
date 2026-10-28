import { Link2, GitBranch, TriangleAlert } from 'lucide-react';

// Only claims features that are actually implemented, per the brief's own §6
// instruction — each point maps to a real, already-built mechanism (see the
// linked modules), not an aspirational capability.

const POINTS = [
  {
    icon: Link2,
    title: 'Every claim traces to a quote',
    description: 'A finding is shown only if its exact wording was found, verbatim, in the source you can open yourself.',
  },
  {
    icon: GitBranch,
    title: 'Sources, not summaries',
    description: 'Each result links back to the guideline, trial or public-health page it came from — the model never answers from memory alone.',
  },
  {
    icon: TriangleAlert,
    title: 'Uncertainty is shown, not hidden',
    description: 'What hasn’t been independently confirmed is labeled as such, not presented as settled.',
  },
];

export function EvidenceTrust() {
  return (
    <section className="mx-auto max-w-4xl px-6 py-28">
      <h2 className="text-center text-3xl font-semibold tracking-tight text-fg sm:text-4xl">Every insight has a source.</h2>
      <p className="mx-auto mt-4 max-w-xl text-center text-base text-muted">
        Explore the sources and relationships behind every result — provenance is one click away.
      </p>

      <div className="mt-16 grid grid-cols-1 gap-10 sm:grid-cols-3">
        {POINTS.map((point) => (
          <div key={point.title} className="flex flex-col gap-3">
            <point.icon className="h-5 w-5 text-fg" aria-hidden="true" />
            <h3 className="text-sm font-medium text-fg">{point.title}</h3>
            <p className="text-sm text-muted">{point.description}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
