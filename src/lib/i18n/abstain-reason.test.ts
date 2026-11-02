import { describe, expect, it } from 'vitest';
import { humanizeAbstainReason } from './abstain-reason';

describe('humanizeAbstainReason', () => {
  it('never leaks the raw "Insufficient unreserved budget" internal detail', () => {
    const result = humanizeAbstainReason('Could not generate an algorithm for this question: Insufficient unreserved budget', 'algorithm');
    expect(result).not.toContain('Insufficient unreserved budget');
    expect(result.toLowerCase()).toContain('budget');
  });

  it('never leaks a raw timeout stack-style message', () => {
    const result = humanizeAbstainReason('Could not generate a mechanism diagram for this question: AgentTimeoutError: Timed out after 30000ms', 'mechanism diagram');
    expect(result).not.toContain('AgentTimeoutError');
    expect(result.toLowerCase()).toContain('too long');
  });

  it('passes through an already-informative violation list unchanged', () => {
    const reason = 'The generated algorithm did not meet structural requirements after one repair attempt: {"kind":"unknown_entity_ref"}';
    expect(humanizeAbstainReason(reason, 'algorithm')).toBe(reason);
  });

  it('passes through "no verified findings" unchanged', () => {
    const reason = 'No verified findings are available yet for this question.';
    expect(humanizeAbstainReason(reason, 'algorithm')).toBe(reason);
  });

  it('never leaks a raw zod validation error for any other internal reason', () => {
    const result = humanizeAbstainReason('Could not generate an algorithm for this question: text.claimIds: Required', 'algorithm');
    expect(result).not.toContain('claimIds');
    expect(result).not.toContain('Required');
  });
});
