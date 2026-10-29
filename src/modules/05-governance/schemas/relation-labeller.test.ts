import { describe, expect, it } from 'vitest';
import {
  LabelRelationsInputSchema,
  LabelRelationsOutputSchema,
  RelationVerdictSchema,
} from './relation-labeller';

describe('LabelRelationsInputSchema', () => {
  it('accepts up to 10 pairs', () => {
    const pairs = Array.from({ length: 10 }, (_, pairId) => ({
      pairId,
      claimAText: 'a',
      claimAQuote: 'qa',
      claimBText: 'b',
      claimBQuote: 'qb',
    }));
    expect(() => LabelRelationsInputSchema.parse({ pairs })).not.toThrow();
  });

  it('rejects more than 10 pairs', () => {
    const pairs = Array.from({ length: 11 }, (_, pairId) => ({
      pairId,
      claimAText: 'a',
      claimAQuote: 'qa',
      claimBText: 'b',
      claimBQuote: 'qb',
    }));
    expect(() => LabelRelationsInputSchema.parse({ pairs })).toThrow();
  });
});

describe('RelationVerdictSchema', () => {
  it('accepts every relation kind the domain Relation type allows', () => {
    for (const kind of ['agrees', 'differs', 'supersedes', 'contradicts', 'adapts'] as const) {
      expect(() => RelationVerdictSchema.parse({ pairId: 0, kind, evidence: 'both quotes agree' })).not.toThrow();
    }
  });

  it('rejects an unknown kind', () => {
    expect(() => RelationVerdictSchema.parse({ pairId: 0, kind: 'unrelated', evidence: 'x' })).toThrow();
  });

  it('rejects empty evidence', () => {
    expect(() => RelationVerdictSchema.parse({ pairId: 0, kind: 'agrees', evidence: '' })).toThrow();
  });
});

describe('LabelRelationsOutputSchema', () => {
  it('accepts an empty relations list (all pairs omitted as unclear)', () => {
    expect(() => LabelRelationsOutputSchema.parse({ relations: [] })).not.toThrow();
  });
});
