import type { CandidateSource } from '../schemas/retrieval';
import { normalizeDoi, normalizePmid, normalizeUrl } from './normalize-identifiers';

// Module 02 deterministic curation, step 2: "Deduplicate: by DOI/PMID, then by
// normalized title + first author + year; keep the richest record."

function richness(candidate: CandidateSource): number {
  return Object.values(candidate).filter((v) => v !== undefined && v !== null && v !== '').length;
}

function dedupeKey(candidate: CandidateSource): string {
  if (candidate.doi) return `doi:${normalizeDoi(candidate.doi)}`;
  if (candidate.pmid) return `pmid:${normalizePmid(candidate.pmid)}`;
  if (candidate.title) {
    const titlePart = candidate.title.toLowerCase().trim();
    const authorPart = candidate.firstAuthor?.toLowerCase().trim() ?? '';
    return `title:${titlePart}:${authorPart}:${candidate.year ?? ''}`;
  }
  return `url:${normalizeUrl(candidate.url)}`;
}

/**
 * Collapses duplicates (same DOI/PMID, or same normalized title+author+year with
 * neither) down to the richest (most fields populated) record. Order of the first
 * occurrence of each group is preserved.
 */
export function deduplicateCandidates(candidates: CandidateSource[]): CandidateSource[] {
  const order: string[] = [];
  const byKey = new Map<string, CandidateSource>();

  for (const candidate of candidates) {
    const key = dedupeKey(candidate);
    const existing = byKey.get(key);
    if (!existing) {
      order.push(key);
      byKey.set(key, candidate);
    } else if (richness(candidate) > richness(existing)) {
      byKey.set(key, candidate);
    }
  }

  return order.map((key) => byKey.get(key)!);
}
