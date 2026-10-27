import { describe, expect, it } from 'vitest';
import { PassageSchema, SourceSchema } from './source';

describe('SourceSchema', () => {
  const base = {
    id: 'src_1',
    kind: 'guideline' as const,
    title: 'ACC/AHA Chest Pain Guideline',
    url: 'https://example.org/guideline',
    accessedAt: '2026-10-27T00:00:00.000Z',
    contentHash: 'abc123',
  };

  it('accepts a minimal valid source', () => {
    expect(SourceSchema.parse(base)).toEqual(base);
  });

  it('accepts optional appliesTo and grading fields', () => {
    const withExtras = {
      ...base,
      year: 2023,
      appliesTo: { country: 'CO', setting: 'emergency' },
      nativeGradingSystem: 'GRADE',
      retracted: false,
    };
    expect(() => SourceSchema.parse(withExtras)).not.toThrow();
  });

  it('rejects an invalid kind', () => {
    expect(() => SourceSchema.parse({ ...base, kind: 'blog_post' })).toThrow();
  });

  it('rejects a non-URL value for url', () => {
    expect(() => SourceSchema.parse({ ...base, url: 'not-a-url' })).toThrow();
  });
});

describe('PassageSchema', () => {
  it('accepts a minimal passage', () => {
    const passage = { id: 'pas_1', sourceId: 'src_1', locator: 'p. 4', text: 'Give aspirin 325 mg.' };
    expect(PassageSchema.parse(passage)).toEqual(passage);
  });
});
