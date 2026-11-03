import type { ReactNode } from 'react';

export interface GeneticEntityReference {
  symbol: string;
  kind?: 'gene' | 'protein';
  links: { label: string; url: string }[];
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function mentionsEntity(text: string, symbol: string): boolean {
  return new RegExp(`(?<![A-Za-z0-9-])${escapeRegExp(symbol)}(?![A-Za-z0-9-])`, 'i').test(text);
}

/** Assigns each verified entity to its first textual block, preventing repeated
 * contextual links across an overview and its subsequent sections. */
export function assignEntitiesToFirstMention(
  blocks: { id: string; text: string }[],
  entities: GeneticEntityReference[],
): Record<string, GeneticEntityReference[]> {
  const assigned = new Set<string>();
  return Object.fromEntries(blocks.map((block) => {
    const matches = entities.filter((entity) => {
      const key = `${entity.kind ?? 'gene'}:${entity.symbol.toUpperCase()}`;
      if (assigned.has(key) || !mentionsEntity(block.text, entity.symbol)) return false;
      assigned.add(key);
      return true;
    });
    return [block.id, matches];
  }));
}

function preferredLink(entity: GeneticEntityReference) {
  const preferred = entity.kind === 'protein' ? ['UniProt'] : ['NCBI Gene', 'Ensembl', 'HGNC'];
  return preferred.flatMap((label) => entity.links.filter((link) => link.label === label))[0];
}

function destinationLabel(url: string): string {
  try {
    const destination = new URL(url);
    const path = destination.pathname === '/' ? '' : destination.pathname.replace(/\/$/, '');
    return `${destination.hostname.replace(/^www\./, '')}${path}`;
  } catch {
    return url;
  }
}

export function GeneticEntityText({ text, entities }: { text: string; entities: GeneticEntityReference[] }) {
  const verified = entities.filter((entity) => entity.symbol.length >= 3 && preferredLink(entity));
  if (!verified.length) return <>{text}</>;
  const bySymbol = new Map(verified.map((entity) => [entity.symbol.toUpperCase(), entity]));
  const pattern = new RegExp(`(?<![A-Za-z0-9-])(${verified.map((entity) => escapeRegExp(entity.symbol)).join('|')})(?![A-Za-z0-9-])`, 'gi');
  const parts: ReactNode[] = [];
  const linked = new Set<string>();
  let cursor = 0;
  for (const match of text.matchAll(pattern)) {
    const index = match.index;
    const value = match[0];
    const entity = bySymbol.get(value.toUpperCase());
    if (!entity) continue;
    const entityKey = `${entity.kind ?? 'gene'}:${entity.symbol.toUpperCase()}`;
    if (linked.has(entityKey)) continue;
    linked.add(entityKey);
    parts.push(text.slice(cursor, index));
    const link = preferredLink(entity)!;
    const tooltipId = `entity-link-${index}-${entity.symbol.replace(/[^A-Za-z0-9_-]/g, '')}`;
    parts.push(
      <span key={`${index}-${entity.symbol}`} className="group/entity relative inline-block">
        <a
          href={link.url}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Open ${entity.symbol} in ${link.label}`}
          aria-describedby={tooltipId}
          className="font-medium underline decoration-border-strong underline-offset-[3px] transition-colors hover:decoration-fg focus-visible:rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          {value}
        </a>
        <span
          id={tooltipId}
          role="tooltip"
          className="pointer-events-none invisible absolute bottom-[calc(100%+0.55rem)] left-1/2 z-40 w-max max-w-64 -translate-x-1/2 translate-y-1 rounded-lg border border-border-strong bg-[#101010] px-3 py-2 text-left opacity-0 shadow-[0_10px_32px_rgba(0,0,0,.45)] transition-[opacity,transform,visibility] duration-150 group-hover/entity:visible group-hover/entity:translate-y-0 group-hover/entity:opacity-100 group-focus-within/entity:visible group-focus-within/entity:translate-y-0 group-focus-within/entity:opacity-100"
        >
          <span className="block text-xs font-medium leading-4 text-fg">{entity.symbol} · {link.label}</span>
          <span className="mt-0.5 block max-w-56 truncate text-[10px] font-normal leading-4 text-muted">{destinationLabel(link.url)}</span>
          <span aria-hidden="true" className="absolute left-1/2 top-full h-2 w-2 -translate-x-1/2 -translate-y-1/2 rotate-45 border-b border-r border-border-strong bg-[#101010]" />
        </span>
      </span>,
    );
    cursor = index + value.length;
  }
  parts.push(text.slice(cursor));
  return <>{parts}</>;
}
