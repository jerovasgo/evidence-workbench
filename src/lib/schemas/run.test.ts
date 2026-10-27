import { describe, expect, it } from 'vitest';
import { ReceiptSchema, RunEventSchema, RunSchema } from './run.js';

describe('ReceiptSchema', () => {
  it('accepts a receipt with zero abstentions', () => {
    const receipt = {
      claimsTotal: 5,
      citationsExist: 5,
      quotesFound: 5,
      retracted: 0,
      supported: 5,
      abstained: 0,
      sourcesByKind: { guideline: 3, rct: 2 },
      generatedAt: '2026-10-27T00:00:00.000Z',
    };
    expect(ReceiptSchema.parse(receipt)).toEqual(receipt);
  });
});

describe('RunSchema', () => {
  it('accepts a minimal run', () => {
    const run = {
      id: 'run_1',
      intent: 'algorithm',
      stages: [{ name: 'route', ms: 120, ok: true }],
      receipt: {
        claimsTotal: 0,
        citationsExist: 0,
        quotesFound: 0,
        retracted: 0,
        supported: 0,
        abstained: 0,
        sourcesByKind: {},
        generatedAt: '2026-10-27T00:00:00.000Z',
      },
      costUsd: 0.02,
      promptVersions: { P1: 'P1@0.1' },
    };
    expect(() => RunSchema.parse(run)).not.toThrow();
  });
});

describe('RunEventSchema', () => {
  it('discriminates by type and rejects an unknown event type', () => {
    expect(() =>
      RunEventSchema.parse({ type: 'stage_started', runId: 'run_1', stage: 'route' }),
    ).not.toThrow();
    expect(() => RunEventSchema.parse({ type: 'band_ready', runId: 'run_1', payload: { a: 1 } })).not.toThrow();
    expect(() => RunEventSchema.parse({ type: 'not_a_real_event', runId: 'run_1' })).toThrow();
  });

  it('requires status on the done event', () => {
    expect(() => RunEventSchema.parse({ type: 'done', runId: 'run_1', status: 'done' })).not.toThrow();
    expect(() => RunEventSchema.parse({ type: 'done', runId: 'run_1', status: 'cancelled' })).toThrow();
  });
});
