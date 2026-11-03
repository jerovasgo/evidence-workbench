import { describe, expect, it } from 'vitest';
import {
  RESEARCH_DEPTH_CONCURRENCY,
  RESEARCH_DEPTH_MAX_SOURCES,
  RESEARCH_DEPTH_RESCUE_ATTEMPTS,
  RESEARCH_DEPTH_TIME_MS,
  type ResearchDepth,
} from './research-depth';

const DEPTHS: ResearchDepth[] = ['quick', 'balanced', 'deep'];

describe('research depth records', () => {
  it('define a value for every depth', () => {
    for (const record of [RESEARCH_DEPTH_TIME_MS, RESEARCH_DEPTH_CONCURRENCY, RESEARCH_DEPTH_MAX_SOURCES, RESEARCH_DEPTH_RESCUE_ATTEMPTS]) {
      for (const depth of DEPTHS) expect(record[depth]).toBeGreaterThan(0);
    }
  });

  it('strictly increase from quick to deep for every depth-conditional value', () => {
    for (const record of [RESEARCH_DEPTH_TIME_MS, RESEARCH_DEPTH_CONCURRENCY, RESEARCH_DEPTH_MAX_SOURCES, RESEARCH_DEPTH_RESCUE_ATTEMPTS]) {
      expect(record.quick).toBeLessThan(record.balanced);
      expect(record.balanced).toBeLessThan(record.deep);
    }
  });

  it('keeps balanced as the original, previously-hardcoded rescue-attempt cap (2)', () => {
    // 2026-11-02 (docs/DECISIONS.md): depth-dependent rescue attempts replaced a
    // hardcoded `attempt <= 2` loop bound — Balanced must reproduce that exact prior
    // behavior so existing (non-depth-specific) retrieval tests stay meaningful.
    expect(RESEARCH_DEPTH_RESCUE_ATTEMPTS.balanced).toBe(2);
  });
});
