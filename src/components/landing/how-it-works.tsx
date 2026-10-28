import { Compass, FolderTree, SlidersHorizontal, Share2, LayoutGrid } from 'lucide-react';

const STEPS = [
  { icon: Compass, label: 'Discover', description: 'Search across guidelines, trials and public-health sources.' },
  { icon: FolderTree, label: 'Classify', description: 'Sources are typed by evidence kind — guideline, review, trial.' },
  { icon: SlidersHorizontal, label: 'Refine', description: 'Duplicates removed, retracted sources excluded.' },
  { icon: Share2, label: 'Connect', description: 'Claims are extracted and matched to their exact source quote.' },
  { icon: LayoutGrid, label: 'Visualize', description: 'Structured, verifiable knowledge — not a wall of links.' },
];

export function HowItWorks() {
  return (
    <section id="how-it-works" className="mx-auto max-w-5xl px-6 py-28">
      <h2 className="text-center text-3xl font-semibold tracking-tight text-fg sm:text-4xl">
        Complex information. Clear understanding.
      </h2>

      <ol className="mt-16 grid grid-cols-1 gap-8 sm:grid-cols-5">
        {STEPS.map((step, i) => (
          <li key={step.label} className="flex flex-col items-start gap-3 sm:items-center sm:text-center">
            <div className="flex items-center gap-3 sm:flex-col sm:gap-2">
              <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full border border-border-strong text-fg">
                <step.icon className="h-4 w-4" aria-hidden="true" />
              </span>
              <span className="text-sm font-medium text-fg">{step.label}</span>
            </div>
            <p className="text-sm text-muted">{step.description}</p>
            {i < STEPS.length - 1 && <span className="hidden text-muted-2 sm:block" aria-hidden="true">&rarr;</span>}
          </li>
        ))}
      </ol>
    </section>
  );
}
