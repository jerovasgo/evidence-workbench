import { describe, expect, it } from 'vitest';
import type { CandidateSource } from '../schemas/retrieval';
import { classifyCandidateMetadata } from './classify-metadata';

const candidate: CandidateSource = { tempId: 'pubmed:1', family: 'pubmed', title: 'An experiment', url: 'https://pubmed.ncbi.nlm.nih.gov/1/', year: 2020 };

describe('metadata classification', () => {
  it('leaves unknown design unclassified instead of guessing from title', () => {
    expect(classifyCandidateMetadata(candidate)).toMatchObject({ kind: 'other', confidence: 'low', publicationYear: 2020 });
  });
  it('uses an explicit publication type when available', () => {
    expect(classifyCandidateMetadata({ ...candidate, pubTypes: ['Systematic Review'] })).toMatchObject({ kind: 'systematic_review', confidence: 'high' });
  });
});
