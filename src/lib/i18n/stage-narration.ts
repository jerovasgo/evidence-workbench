import type { StageName, StageState } from '@/lib/use-run-stream';

// 2026-11-02 (docs/DECISIONS.md): `StageProgress`'s live panel used to show the raw
// server-side strings verbatim — a per-source line like "europe_pmc:MED:42519825:
// ok, 2 claim(s)" is a log line, not something a reader is meant to parse. The data
// underneath (per-stage status, per-source outcome + claim count, source titles via
// `sourceCatalog`) already streams in real time; this file only narrates it. Same
// shape as `result-summary.ts`/`abstain-reason.ts`: a pure, deterministic template,
// never a model call — so it can never say something the run didn't actually do.

const STAGE_SENTENCE: Record<StageName, Partial<Record<StageState['status'], string>>> = {
  structure: {
    running: 'Breaking the question into its scope and sub-questions…',
    ok: 'Identified the scope and sub-questions to investigate.',
    partial: 'Partially structured the question — continuing with what came back.',
    abstain: 'Could not confidently structure the question; continuing with it as written.',
    failed: 'Could not structure the question; continuing with it as written.',
  },
  plan: {
    running: 'Planning literature searches…',
    ok: 'Planned searches across the literature indexes.',
  },
  retrieve: {
    running: 'Searching PubMed and Europe PMC…',
    ok: 'Retrieved candidate sources.',
    partial: 'Retrieved some candidate sources; a few searches had issues.',
    failed: 'The literature search did not return usable sources.',
  },
  classify: {
    running: 'Classifying sources by study type…',
    ok: 'Classified sources by study type.',
  },
  extract: {
    running: 'Reading sources and extracting findings…',
    ok: 'Finished reading and verifying sources.',
    partial: 'Finished reading sources; some could not be fully verified.',
    failed: 'Could not extract findings from the retrieved sources.',
  },
};

/** Falls back to a generic, still-honest sentence for a (stage, status) pair with no
 *  specific entry above, rather than ever showing nothing or throwing. */
export function narrateStageResult(stage: StageName, status: StageState['status']): string {
  const sentence = STAGE_SENTENCE[stage]?.[status];
  if (sentence) return sentence;
  if (status === 'pending') return 'Waiting to start…';
  return `${stage[0]!.toUpperCase()}${stage.slice(1)}: ${status}.`;
}

const SOURCE_OUTCOME_PATTERN = /^(.+): (ok|no_full_text|extraction_failed)(?:, (\d+) claim\(s\))?$/;

export interface ParsedSourceOutcome {
  sourceId: string;
  status: 'ok' | 'no_full_text' | 'extraction_failed';
  claimCount: number;
}

/**
 * Parses the one shape `extract-and-verify-pool.ts`'s per-source outcomes produce
 * (`"<sourceId>: ok|no_full_text|extraction_failed[, N claim(s)]"`). Returns `null`
 * for anything that doesn't match (a future format change, or any other stage's
 * progress line) rather than guessing — shared by `narrateSourceProgress` below and
 * `source-status.ts`'s per-source registry, so both read the exact same real data.
 */
export function parseSourceOutcome(detail: string): ParsedSourceOutcome | null {
  const match = detail.match(SOURCE_OUTCOME_PATTERN);
  if (!match) return null;
  const [, sourceId, status, claimCountRaw] = match;
  return { sourceId: sourceId!, status: status as ParsedSourceOutcome['status'], claimCount: claimCountRaw ? Number(claimCountRaw) : 0 };
}

/**
 * Resolves the parsed outcome's source id to its real title via `sourceCatalog`. A
 * line that doesn't match the known shape is returned unchanged rather than mangled
 * or dropped, so this never hides real information behind a bad parse.
 */
export function narrateSourceProgress(detail: string, sourceCatalog: Record<string, { title: string }>): string {
  const parsed = parseSourceOutcome(detail);
  if (!parsed) return detail;
  const title = sourceCatalog[parsed.sourceId]?.title ?? parsed.sourceId;
  if (parsed.status === 'ok' && parsed.claimCount > 0) return `Verified ${parsed.claimCount} finding${parsed.claimCount === 1 ? '' : 's'} in "${title}".`;
  if (parsed.status === 'ok') return `Read "${title}" — no usable findings there.`;
  if (parsed.status === 'no_full_text') return `Could not access the full text of "${title}".`;
  return `Could not extract findings from "${title}".`;
}
