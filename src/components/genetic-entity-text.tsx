import type { ReactNode } from 'react';

export interface GeneticEntityReference {
  symbol: string;
  kind?: 'gene' | 'protein';
  links: { label: string; url: string }[];
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function preferredLink(entity: GeneticEntityReference) {
  const preferred = entity.kind === 'protein' ? ['UniProt'] : ['NCBI Gene', 'Ensembl', 'HGNC'];
  return preferred.flatMap((label) => entity.links.filter((link) => link.label === label))[0];
}

export function GeneticEntityText({ text, entities }: { text: string; entities: GeneticEntityReference[] }) {
  const verified = entities.filter((entity) => entity.symbol.length >= 3 && preferredLink(entity));
  if (!verified.length) return <>{text}</>;
  const bySymbol = new Map(verified.map((entity) => [entity.symbol.toUpperCase(), entity]));
  const pattern = new RegExp(`(?<![A-Za-z0-9-])(${verified.map((entity) => escapeRegExp(entity.symbol)).join('|')})(?![A-Za-z0-9-])`, 'gi');
  const parts: ReactNode[] = [];
  let cursor = 0;
  for (const match of text.matchAll(pattern)) {
    const index = match.index;
    const value = match[0];
    const entity = bySymbol.get(value.toUpperCase());
    if (!entity) continue;
    parts.push(text.slice(cursor, index));
    const link = preferredLink(entity)!;
    parts.push(
      <a
        key={`${index}-${entity.symbol}`}
        href={link.url}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`Open ${entity.symbol} in ${link.label}`}
        className="font-medium underline decoration-border-strong underline-offset-[3px] transition-colors hover:decoration-fg focus-visible:rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
      >
        {value}
      </a>,
    );
    cursor = index + value.length;
  }
  parts.push(text.slice(cursor));
  return <>{parts}</>;
}
