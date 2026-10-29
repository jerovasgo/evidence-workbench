import type { Claim, Receipt } from '@/shared/domain';

// 2026-10-28 conversational-flow brief, Etapa D: "explicación breve... respaldada
// por los resultados realmente obtenidos, evitando conclusiones no verificadas."
// This is a deterministic, template-built summary from the run's own Receipt/Claim[]
// — every sentence is a count the pipeline actually produced, never a model's prose.
// It is NOT SPEC §7's "answer card" (P12) — that agent isn't built and is explicitly
// in CLAUDE.md's "cut order" list; this exists so the result never opens on silence,
// without adding a model call, latency or fabrication risk.

type RunStatus = 'streaming' | 'done' | 'partial' | 'abstained' | 'failed';

function sourceKindsPhrase(sourcesByKind: Record<string, number>): string {
  const entries = Object.entries(sourcesByKind)
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1]);
  if (entries.length === 0) return '';
  const top = entries.slice(0, 3).map(([kind, n]) => `${n} ${kind.replace(/_/g, ' ')}`);
  return ` (${top.join(', ')})`;
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

export function buildResultSummary(status: RunStatus, receipt: Receipt | null, claims: Claim[] | null): string | null {
  if (status === 'streaming') return null;

  if (status === 'abstained') {
    return 'This doesn’t read as a scientific evidence question I can investigate — try rephrasing around a specific finding, topic or question.';
  }

  if (status === 'failed' || !receipt) return null;

  const claimCount = claims?.length ?? receipt.citationsExist;
  const safetyCount = claims?.filter((c) => c.safetyCritical).length ?? 0;
  const sourceCount = Object.values(receipt.sourcesByKind).reduce((a, b) => a + b, 0);

  const parts: string[] = [
    `Checked ${plural(receipt.claimsTotal, 'claim')} across ${plural(sourceCount, 'source')}${sourceKindsPhrase(receipt.sourcesByKind)}.`,
  ];

  if (claimCount > 0) {
    parts.push(`${plural(claimCount, 'claim')} passed verification${safetyCount > 0 ? `, ${safetyCount} of them safety-critical` : ''}.`);
  } else {
    parts.push('None passed full verification — see the receipt below for what was checked.');
  }

  if (receipt.retracted > 0) {
    parts.push(`${plural(receipt.retracted, 'source')} excluded as retracted or withdrawn.`);
  }

  return parts.join(' ');
}
