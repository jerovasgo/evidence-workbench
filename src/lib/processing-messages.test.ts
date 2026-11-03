import { describe, expect, it } from 'vitest';
import { initialProcessingMessage } from './processing-messages';

describe('initialProcessingMessage', () => {
  it('is query-specific without claiming results', () => {
    const message = initialProcessingMessage('Compare gene expression studies under hypoxia', 'auto');
    expect(message).toContain('gene expression studies under hypoxia');
    expect(message).not.toMatch(/on it|verified|found/i);
  });

  it('matches Spanish queries and the requested representation', () => {
    expect(initialProcessingMessage('Explica el mecanismo de HIF1A en hipoxia', 'mechanism'))
      .toContain('Voy a examinar el mecanismo');
  });
});
