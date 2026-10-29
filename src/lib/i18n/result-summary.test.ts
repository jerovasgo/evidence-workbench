import { describe, expect, it } from 'vitest';
import type { Claim, Receipt } from '@/shared/domain';
import { buildResultSummary } from './result-summary';

const baseReceipt: Receipt = {
  claimsTotal: 4,
  citationsExist: 2,
  quotesFound: 2,
  retracted: 0,
  supported: 2,
  abstained: 0,
  sourcesByKind: { standards_body: 1, controlled_experiment: 2, other: 5 },
  generatedAt: '2026-10-28T00:00:00.000Z',
};

function claim(overrides: Partial<Claim> = {}): Claim {
  return {
    id: 'c1',
    text: 'A polar aprotic solvent increases the SN2 reaction rate.',
    basis: 'primary',
    actionType: 'finding',
    conditions: [],
    sourceId: 's1',
    passageId: 'p1',
    quote: 'Aspirin.',
    grade: { certainty: 'ungraded', origin: 'ai_estimated' },
    verification: { exists: true, quoteFound: true, retracted: false, support: 'supports' },
    safetyCritical: false,
    ...overrides,
  };
}

describe('buildResultSummary', () => {
  it('returns null while still streaming', () => {
    expect(buildResultSummary('streaming', baseReceipt, null)).toBeNull();
  });

  it('returns null on failure (errorMessage already covers that case)', () => {
    expect(buildResultSummary('failed', baseReceipt, null)).toBeNull();
  });

  it('returns a fixed, honest message for an abstained (out-of-scope) run', () => {
    expect(buildResultSummary('abstained', null, null)).toContain('try rephrasing');
  });

  it('reports claim and source counts from the receipt when claims passed', () => {
    const summary = buildResultSummary('done', baseReceipt, [claim(), claim({ id: 'c2', safetyCritical: true })]);
    expect(summary).toContain('4 claims');
    expect(summary).toContain('8 sources');
    expect(summary).toContain('2 claims passed verification');
    expect(summary).toContain('1 of them safety-critical');
  });

  it('is honest when nothing passed verification', () => {
    const summary = buildResultSummary('partial', { ...baseReceipt, citationsExist: 0 }, []);
    expect(summary).toContain('None passed full verification');
  });

  it('mentions retracted sources only when there are any', () => {
    const withRetraction = buildResultSummary('done', { ...baseReceipt, retracted: 1 }, [claim()]);
    expect(withRetraction).toContain('1 source excluded as retracted');
    const without = buildResultSummary('done', baseReceipt, [claim()]);
    expect(without).not.toContain('excluded as retracted');
  });
});
