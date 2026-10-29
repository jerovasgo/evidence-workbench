import type { Claim } from '@/shared/domain';

/** Only recent claims with all verification gates documented may enter the matrix. */
export function buildEvidenceMatrix(claims: Claim[]): { sourceId: string; claims: Claim[] }[] {
  const sources = new Map<string, Claim[]>();
  for (const claim of claims) {
    const v = claim.verification;
    if (!v.exists || !v.quoteFound || v.retracted || v.support !== 'supports' || v.retractionCheck !== 'crossref_no_signal') continue;
    const group = sources.get(claim.sourceId) ?? [];
    group.push(claim);
    sources.set(claim.sourceId, group);
  }
  return Array.from(sources, ([sourceId, sourceClaims]) => ({ sourceId, claims: sourceClaims }));
}
