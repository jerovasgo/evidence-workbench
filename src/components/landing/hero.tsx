'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { SearchBar } from '@/components/search-bar';
import { DEFAULT_MODE, type Mode } from '@/lib/modes';

const SUGGESTIONS = [
  'Map the evidence behind a standards-body publication.',
  'Build a decision algorithm from recent chemistry experiments.',
  'Compare competing findings and their supporting evidence.',
  'Trace how a lab protocol has evolved over time.',
];

const ROTATE_MS = 6000;

export function Hero() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [mode, setMode] = useState<Mode>(DEFAULT_MODE);
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
    const params = new URLSearchParams({ q: text, mode });
    router.push(`/dashboard?${params.toString()}`);
  }

  return (
    <section className="flex min-h-screen flex-col items-center justify-center px-6 pt-14">
      <div className="mx-auto flex w-full max-w-2xl flex-col items-center text-center">
        <h1 className="text-4xl font-semibold tracking-tight text-fg sm:text-5xl md:text-6xl">
          From evidence to clarity.
        </h1>
        <p className="mt-5 max-w-lg text-balance text-base text-muted sm:text-lg">
          Discover, refine, and connect information. Turn complex evidence into clear, actionable visual knowledge.
        </p>

        <div className="mt-10 w-full">
          <SearchBar value={query} onChange={setQuery} mode={mode} onModeChange={setMode} onSubmit={() => submit(query)} autoFocus />
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
