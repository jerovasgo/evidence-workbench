import { describe, expect, it } from 'vitest';
import { ClassifySourcesOutputSchema, SourceClassificationSchema } from './classification';

describe('SourceClassificationSchema', () => {
  it('accepts a minimal classification with only the required fields', () => {
    const c = { sourceId: 's1', kind: 'guideline' as const, isScientific: true, confidence: 'high' as const };
    expect(SourceClassificationSchema.parse(c)).toEqual(c);
  });

  it('accepts a non-scientific source with every optional field omitted', () => {
    const c = { sourceId: 's2', kind: 'other' as const, isScientific: false, confidence: 'high' as const };
    expect(() => SourceClassificationSchema.parse(c)).not.toThrow();
  });

  it('rejects a kind outside the canonical SourceKind enum (e.g. the old draft\'s "non_scientific")', () => {
    expect(() =>
      SourceClassificationSchema.parse({ sourceId: 's1', kind: 'non_scientific', isScientific: false, confidence: 'high' }),
    ).toThrow();
  });
});

describe('ClassifySourcesOutputSchema', () => {
  it('accepts a batch of classifications in input order', () => {
    const output = {
      classifications: [
        { sourceId: 's1', kind: 'guideline' as const, isScientific: true, confidence: 'high' as const },
        { sourceId: 's2', kind: 'rct' as const, isScientific: true, confidence: 'medium' as const },
      ],
    };
    expect(ClassifySourcesOutputSchema.parse(output)).toEqual(output);
  });
});
