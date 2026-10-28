import { describe, expect, it } from 'vitest';
import { initialProcessingMessage } from './processing-messages';

describe('initialProcessingMessage', () => {
  it('returns a mode-specific message for algorithm and evidence_map', () => {
    expect(initialProcessingMessage('algorithm')).toContain('Algorithm view');
    expect(initialProcessingMessage('evidence_map')).toContain('Evidence Map view');
  });

  it('never claims a source was verified or the task already finished', () => {
    for (const mode of ['algorithm', 'evidence_map', 'auto', undefined] as const) {
      const message = initialProcessingMessage(mode);
      expect(message.toLowerCase()).not.toContain('verified.');
      expect(message.toLowerCase()).not.toContain('found');
      expect(message.toLowerCase()).not.toContain('completed');
    }
  });

  it('falls back to a generic message for auto or an unset mode', () => {
    expect(initialProcessingMessage('auto')).toBe(initialProcessingMessage(undefined));
  });
});
