'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { SearchBar } from '@/components/search-bar';
import { DEFAULT_MODE, type Mode } from '@/lib/modes';
import { DEFAULT_RESEARCH_DEPTH, type ResearchDepth } from '@/lib/research-depth';

const SUGGESTIONS = [
  'What evidence links HIF-1 alpha to the response to hypoxia?',
  'Compare studies of gene expression under hypoxia.',
  'Trace the evidence behind a gene regulatory relationship.',
  'Where do experimental findings on gene regulation disagree?',
];

const ROTATE_MS = 6000;

export function Hero() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [mode, setMode] = useState<Mode>(DEFAULT_MODE);
  const [depth, setDepth] = useState<ResearchDepth>(DEFAULT_RESEARCH_DEPTH);
  const [activeSuggestion, setActiveSuggestion] = useState(0);
  const [paused, setPaused] = useState(false);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (paused) return;
    const id = setInterval(() => setActiveSuggestion((i) => (i + 1) % SUGGESTIONS.length), ROTATE_MS);
    return () => clearInterval(id);
  }, [paused]);

  function submit(text: string) {
    if (!text.trim()) return;
    const params = new URLSearchParams({ q: text, mode, depth });
    router.push(`/dashboard?${params.toString()}`);
  }

  return (
    <section className="landing-hero relative flex min-h-[90vh] flex-col items-center justify-center overflow-hidden px-6 pt-28 pb-20">
      <div className="relative z-10 mx-auto flex w-full max-w-3xl flex-col items-center text-center">
        <p className="editorial-kicker mb-8">FEDOS / GENETIC EVIDENCE</p>
        <h1 className="text-4xl font-light tracking-[-0.055em] text-fg sm:text-5xl md:text-6xl">
          Follow the evidence.<br /><span className="text-[#b9b9b9]">Understand the biology.</span>
        </h1>
        <p className="mt-5 max-w-lg text-balance text-base text-muted sm:text-lg">
          Investigate genetic research with an agentic evidence workbench built to trace claims to their sources, reveal context, and surface uncertainty.
        </p>

        <div className="hero-search mt-10 w-full">
          <SearchBar value={query} onChange={setQuery} mode={mode} onModeChange={setMode} depth={depth} onDepthChange={setDepth} onSubmit={() => submit(query)} placeholder="Explore a genetic mechanism or research claim..." />
        </div>

        <div
          className="mt-6 flex h-10 items-center justify-center"
          onMouseEnter={() => setPaused(true)}
          onMouseLeave={() => setPaused(false)}
        >
          <button
            type="button"
            onClick={() => submit(SUGGESTIONS[activeSuggestion]!)}
            className="group inline-flex items-center gap-2 text-sm text-muted transition-colors hover:text-fg"
          >
            <span aria-hidden="true" className="text-muted-2">
              Try:
            </span>
            <AnimatePresence mode="wait">
              <motion.span
                key={activeSuggestion}
                initial={reduceMotion ? false : { opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reduceMotion ? undefined : { opacity: 0, y: -4 }}
                transition={{ duration: 0.25 }}
                className="underline decoration-border-strong decoration-1 underline-offset-4 group-hover:decoration-fg"
              >
                &ldquo;{SUGGESTIONS[activeSuggestion]}&rdquo;
              </motion.span>
            </AnimatePresence>
          </button>
        </div>
      </div>
    </section>
  );
}
