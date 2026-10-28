'use client';

import { useId, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';

// SPEC §11 screen (1): Home — "single input + example conditions."

const EXAMPLE_CONDITIONS = [
  'Suspected acute coronary syndrome in the emergency department',
  'Community-acquired pneumonia in an adult, outpatient setting',
  'New-onset atrial fibrillation, hemodynamically stable',
];

export default function HomePage() {
  const router = useRouter();
  const inputId = useId();
  const [freeText, setFreeText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!freeText.trim() || submitting) return;
    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch('/api/runs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ freeText, userId: null }),
      });
      const body = await res.json();

      if (!res.ok) {
        setError(body.error ?? 'Something went wrong. Please rephrase and try again.');
        setSubmitting(false);
        return;
      }

      router.push(`/runs/${body.runId}`);
    } catch {
      setError('Could not reach the server. Please try again.');
      setSubmitting(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col items-center justify-center gap-8 px-6 py-16">
      <div className="text-center">
        <h1 className="text-2xl font-medium text-fg">Evidence Workbench</h1>
        <p className="mt-2 text-sm text-muted">Navigate, compare, audit and verify clinical evidence — in seconds.</p>
      </div>

      <form
        className="w-full"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <label htmlFor={inputId} className="sr-only">
          Clinical condition or question
        </label>
        <textarea
          id={inputId}
          value={freeText}
          onChange={(e) => setFreeText(e.target.value)}
          placeholder="Describe a clinical condition or question — never a specific patient."
          rows={4}
          maxLength={1500}
          className="w-full resize-none rounded-[var(--radius-card)] border border-border bg-surface p-4 text-sm text-fg placeholder:text-muted focus:border-accent"
        />

        <div className="mt-3 flex flex-wrap gap-2">
          {EXAMPLE_CONDITIONS.map((example) => (
            <button
              key={example}
              type="button"
              onClick={() => setFreeText(example)}
              className="rounded-[var(--radius-chip)] border border-border px-3 py-1 text-xs text-muted transition-colors duration-150 hover:border-accent hover:text-fg"
            >
              {example}
            </button>
          ))}
        </div>

        {error && (
          <p role="alert" className="mt-3 text-sm text-conflict">
            {error}
          </p>
        )}

        <div className="mt-4 flex justify-end">
          <Button type="submit" disabled={!freeText.trim() || submitting}>
            {submitting ? 'Starting…' : 'Audit the evidence'}
          </Button>
        </div>
      </form>
    </main>
  );
}
