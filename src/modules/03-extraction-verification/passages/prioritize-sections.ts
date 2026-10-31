import type { Passage } from '@/shared/domain';
export type SectionAudit = { passageId: string; locator: string; section: string; priority: number; status: 'pending' | 'reviewed' | 'unreviewed'; reason: string };
export function prioritizeSections(passages: Passage[], query: string) {
  const methodQuestion = /methods?|protocol|método|protocolo/i.test(query) && !/expression|expresión|findings|hallazgos/i.test(query);
  const interpretation = /discussion|discuss|limitaciones|limitations|interpret|discusión/i.test(query);
  let section = 'unknown';
  return passages.map((passage, index) => {
    const heading = passage.text.split(/\n\s*\n/)[0]!.trim().replace(/^\d+[.\s]+/, '').toLowerCase();
    const match = heading.match(/^(abstract|introduction|background|results|discussion|conclusions?|methods|materials and methods)(?:$|\s*[:—-])/);
    if (match) section = match[1]!;
    const priority = section === 'results' ? 4 : section === 'discussion' ? (interpretation ? 5 : 3) : /methods/.test(section) ? (methodQuestion ? 5 : 1) : section === 'abstract' ? 2 : 0;
    return { passage, index, audit: { passageId: passage.id, locator: passage.locator, section, priority, status: 'pending' as SectionAudit['status'], reason: methodQuestion ? 'Methods question' : interpretation ? 'Interpretation question' : 'Prioritize results and discussion' } };
  }).sort((a, b) => b.audit.priority - a.audit.priority || a.index - b.index);
}

/**
 * Select a bounded, section-balanced deep-reading set. Results and Discussion are
 * represented before Abstract/Methods; passages outside the set remain auditable.
 */
export function selectDeepReadingPassages(
  prioritized: ReturnType<typeof prioritizeSections>,
  maxPassages = 6,
) {
  if (prioritized.length <= maxPassages) return prioritized;
  const quotas: Record<string, number> = { results: 3, discussion: 3, conclusions: 1, abstract: 1 };
  const selected: typeof prioritized = [];
  const count = new Map<string, number>();
  for (const entry of prioritized) {
    const limit = quotas[entry.audit.section] ?? 0;
    if ((count.get(entry.audit.section) ?? 0) >= limit) continue;
    selected.push(entry);
    count.set(entry.audit.section, (count.get(entry.audit.section) ?? 0) + 1);
    if (selected.length >= maxPassages) return selected;
  }
  for (const entry of prioritized) {
    if (selected.includes(entry)) continue;
    selected.push(entry);
    if (selected.length >= maxPassages) break;
  }
  return selected;
}
