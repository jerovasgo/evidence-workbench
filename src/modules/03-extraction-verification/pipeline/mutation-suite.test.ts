import { describe, expect, it } from 'vitest';
import type { Passage } from '@/shared/domain';
import type { ExtractedClaim } from '../schemas/extraction';
import { verifyClaim } from './verify-claim';

const passage: Passage = { id: 'source-a:0', sourceId: 'source-a', locator: 'Results', text: 'In HNF1A-deficient cells, expression of gene Y increased by 20% relative to controls.' };
const extracted: ExtractedClaim = {
  text: 'In HNF1A-deficient cells, gene Y expression increased by 20%.',
  basis: 'primary', actionType: 'finding', conditions: [],
  quote: passage.text, passageId: passage.id, safetyCritical: false,
};

describe('deterministic mutation probes', () => {
  it('accepts the located original', () => {
    expect(verifyClaim({ extracted, sourceId: 'source-a', retracted: false }, [passage]).outcome).toBe('kept');
  });
  it('rejects a changed quotation', () => {
    const changed = { ...extracted, quote: extracted.quote.replace('increased', 'decreased') };
    expect(verifyClaim({ extracted: changed, sourceId: 'source-a', retracted: false }, [passage]).outcome).toBe('dropped');
  });
  it('rejects a changed number in text or structured conditions', () => {
    expect(verifyClaim({ extracted: { ...extracted, text: extracted.text.replace('20%', '80%') }, sourceId: 'source-a', retracted: false }, [passage]).outcome).toBe('dropped');
    expect(verifyClaim({ extracted: { ...extracted, conditions: [{ variable: 'increase', op: '=', value: 80, unit: '%' }] }, sourceId: 'source-a', retracted: false }, [passage]).outcome).toBe('dropped');
  });
  it('rejects a quotation attached to a different source', () => {
    expect(verifyClaim({ extracted, sourceId: 'source-b', retracted: false }, [passage]).outcome).toBe('dropped');
  });
});
