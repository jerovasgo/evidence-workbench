import { parseSourceOutcome } from './i18n/stage-narration';

// 2026-11-02 (docs/DECISIONS.md): a per-source status model for the Evidence &
// Sources tab, replacing ambiguous labels ("Unreviewed", "No completion record
// yet") with a small, honest state machine a source moves through: identified →
// pending evaluation → evaluated (being read right now) → included or excluded,
// with a real reason attached to an exclusion. Built entirely from state
// `useRunStream` already exposes — no new network call, no new SSE event.

export type SourceRegistryStatus = 'identified' | 'pending_evaluation' | 'evaluated' | 'included' | 'excluded';

export interface SourceRegistryEntry {
  id: string;
  title: string;
  url: string;
  doi?: string;
  pmid?: string;
  year?: number;
  status: SourceRegistryStatus;
  claimsExtracted: number;
  reason?: string;
}

export interface SourceRegistrySummary {
  identified: number;
  pendingEvaluation: number;
  evaluated: number;
  included: number;
  excluded: number;
}

type CatalogSource = { id: string; title: string; url: string; doi?: string; pmid?: string; year?: number };

export function computeSourceRegistry(
  sourceCatalog: Record<string, CatalogSource>,
  sourceProgress: string[],
  verifiedClaims: { sourceId: string }[],
  withdrawals: { sourceId: string; count: number; reason?: string }[],
  provisionalBySource: Record<string, unknown[]>,
  isStreaming: boolean,
): { entries: SourceRegistryEntry[]; summary: SourceRegistrySummary } {
  const verifiedCountBySource = new Map<string, number>();
  for (const claim of verifiedClaims) verifiedCountBySource.set(claim.sourceId, (verifiedCountBySource.get(claim.sourceId) ?? 0) + 1);

  const outcomeBySource = new Map<string, ReturnType<typeof parseSourceOutcome>>();
  for (const line of sourceProgress) {
    const parsed = parseSourceOutcome(line);
    if (parsed) outcomeBySource.set(parsed.sourceId, parsed);
  }

  const withdrawalBySource = new Map(withdrawals.map((entry) => [entry.sourceId, entry]));

  const entries: SourceRegistryEntry[] = Object.values(sourceCatalog).map((source) => {
    const base = { id: source.id, title: source.title, url: source.url, doi: source.doi, pmid: source.pmid, year: source.year };
    const verifiedCount = verifiedCountBySource.get(source.id) ?? 0;
    if (verifiedCount > 0) return { ...base, status: 'included' as const, claimsExtracted: verifiedCount };

    const withdrawal = withdrawalBySource.get(source.id);
    if (withdrawal && withdrawal.count > 0) {
      return { ...base, status: 'excluded' as const, claimsExtracted: 0, reason: withdrawal.reason ?? 'Extracted claims did not survive verification.' };
    }

    const outcome = outcomeBySource.get(source.id);
    if (outcome) {
      if (outcome.status === 'no_full_text') return { ...base, status: 'excluded' as const, claimsExtracted: 0, reason: 'Full text could not be accessed.' };
      if (outcome.status === 'extraction_failed') return { ...base, status: 'excluded' as const, claimsExtracted: 0, reason: 'Extraction failed.' };
      return { ...base, status: 'excluded' as const, claimsExtracted: 0, reason: 'No verifiable finding was extracted from this source.' };
    }

    if ((provisionalBySource[source.id]?.length ?? 0) > 0) return { ...base, status: 'evaluated' as const, claimsExtracted: 0 };
    if (isStreaming) return { ...base, status: 'pending_evaluation' as const, claimsExtracted: 0 };
    return { ...base, status: 'identified' as const, claimsExtracted: 0 };
  });

  const summary: SourceRegistrySummary = { identified: 0, pendingEvaluation: 0, evaluated: 0, included: 0, excluded: 0 };
  for (const entry of entries) {
    if (entry.status === 'identified') summary.identified += 1;
    else if (entry.status === 'pending_evaluation') summary.pendingEvaluation += 1;
    else if (entry.status === 'evaluated') summary.evaluated += 1;
    else if (entry.status === 'included') summary.included += 1;
    else summary.excluded += 1;
  }

  return { entries, summary };
}
