import { describe, expect, it } from 'vitest';
import { initialProcessingMessage } from './processing-messages';

describe('initialProcessingMessage', () => {
  it('returns a mode-specific message for algorithm, mechanism and evidence_map', () => {
    expect(initialProcessingMessage('algorithm')).toContain('flowchart');
    expect(initialProcessingMessage('mechanism')).toContain('mechanism');
    expect(initialProcessingMessage('evidence_map')).toContain('map');
  });

  it('never claims a view is unbuilt — algorithm/mechanism/evidence_map all ship real views', () => {
    for (const mode of ['algorithm', 'mechanism', 'evidence_map'] as const) {
      expect(initialProcessingMessage(mode).toLowerCase()).not.toContain('isn’t built yet');
    }
  });

  it('never claims a source was verified or the task already finished', () => {
    for (const mode of ['algorithm', 'mechanism', 'evidence_map', 'auto', undefined] as const) {
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
