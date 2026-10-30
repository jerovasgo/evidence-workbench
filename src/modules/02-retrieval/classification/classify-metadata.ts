import type { CandidateSource } from '../schemas/retrieval';
import type { SourceClassification } from '../schemas/classification';
import { applyPubmedTypeOverride } from './pubmed-type-override';

/** Metadata is enough for an honest initial label; unknown study design stays `other`. */
export function classifyCandidateMetadata(candidate: CandidateSource): SourceClassification {
  const base: SourceClassification = {
    sourceId: candidate.tempId,
    kind: 'other',
    isScientific: candidate.family === 'pubmed' || candidate.family === 'europe_pmc',
    issuer: candidate.issuer,
    publicationYear: candidate.year,
    confidence: 'low',
  };
  const classified = candidate.pubTypes ? applyPubmedTypeOverride(base, candidate.pubTypes) : base;
  return classified.kind === 'other' ? classified : { ...classified, confidence: 'high' };
}
