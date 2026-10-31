import { describe, expect, it } from 'vitest';
import type { Claim } from '@/shared/domain';
import type { SourceClassification } from '@/modules/02-retrieval';
import { buildReceipt } from './build-receipt';
import type { RunRetrievalResult, StageResult } from './run-retrieval';

function ok<T>(stage: string, value: T, counts?: Record<string, number>): StageResult<T> {
  return { stage, status: 'ok', value, metrics: { ms: 1, costUsd: 0, counts } };
}

const claim: Claim = {
  id: 'c1',
  text: 'A polar aprotic solvent increases the SN2 reaction rate.',
  basis: 'primary',
  actionType: 'finding',
  conditions: [],
  sourceId: 's1',
  passageId: 'p1',
  quote: 'Polar aprotic solvents accelerate SN2 reactions.',
  grade: { certainty: 'ungraded', origin: 'ai_estimated' },
  verification: { exists: true, quoteFound: true, retracted: false, support: 'unknown' },
  safetyCritical: false,
};

const classifications: SourceClassification[] = [
  { sourceId: 's1', kind: 'standards_body', isScientific: true, confidence: 'high', publicationYear: 2022 },
  { sourceId: 's2', kind: 'controlled_experiment', isScientific: true, confidence: 'medium', publicationYear: 2018 },
];

function baseResult(overrides: Partial<RunRetrievalResult> = {}): RunRetrievalResult {
  return {
    structure: ok('structure', { context: 'unknown', subQuestions: [], scopeParameters: {} }),
    plan: ok('plan', { queries: [] }),
    retrieval: ok('retrieve', []),
    classification: ok('classify', classifications),
    extraction: ok('extract', [claim], { claimsKept: 1, claimsDropped: 1, retracted: 1 }),
    sourceScores: {},
    ...overrides,
  };
}

describe('buildReceipt', () => {
  it('counts claims, dropped, retracted and sources by kind', () => {
    const receipt = buildReceipt(baseResult());

    expect(receipt.claimsTotal).toBe(2); // 1 kept + 1 dropped
    expect(receipt.citationsExist).toBe(1);
    expect(receipt.quotesFound).toBe(1);
    expect(receipt.retracted).toBe(1);
    expect(receipt.supported).toBe(0);
    expect(receipt.abstained).toBe(0);
    expect(receipt.sourcesByKind).toEqual({ standards_body: 1, controlled_experiment: 1 });
    expect(receipt.oldestSourceYear).toBe(2018);
  });

  it('counts only claims the support-judge marked as supports', () => {
    const supportedClaim: Claim = { ...claim, id: 'c2', verification: { ...claim.verification, support: 'supports' } };
    const partialClaim: Claim = { ...claim, id: 'c3', verification: { ...claim.verification, support: 'partial' } };
    const receipt = buildReceipt(baseResult({ extraction: ok('extract', [claim, supportedClaim, partialClaim]) }));
    expect(receipt.supported).toBe(1);
  });

  it('abstains separately for sub-questions without a supported answer', () => {
    const supported: Claim = { ...claim, subQuestionIndex: 0, verification: { ...claim.verification, support: 'supports' } };
    const receipt = buildReceipt(baseResult({
      structure: ok('structure', { context: 'unknown', subQuestions: ['Does expression change?', 'Does phenotype change?'], scopeParameters: {} }),
      extraction: ok('extract', [supported]),
    }));
    expect(receipt.abstained).toBe(1);
  });

  it('reconciles fully supported, partial and dropped claim counts', () => {
    const supported: Claim = { ...claim, verification: { ...claim.verification, support: 'supports' } };
    const receipt = buildReceipt(baseResult({ extraction: ok('extract', [supported], { claimsKept: 1, claimsPartial: 2, claimsDropped: 3, drop_number: 2, drop_quote: 1 }) }));
    expect(receipt.claimsTotal).toBe(6);
    expect(receipt.supported).toBe(1);
    expect(receipt.partial).toBe(2);
    expect(receipt.dropReasons).toEqual({ number: 2, quote: 1 });
  });

  it('omits oldestSourceYear when no classification has a publicationYear', () => {
    const receipt = buildReceipt(
      baseResult({ classification: ok('classify', [{ sourceId: 's1', kind: 'other', isScientific: false, confidence: 'low' }]) }),
    );
    expect(receipt.oldestSourceYear).toBeUndefined();
  });

  it('produces a valid-looking ISO timestamp', () => {
    const receipt = buildReceipt(baseResult());
    expect(() => new Date(receipt.generatedAt).toISOString()).not.toThrow();
  });
});
