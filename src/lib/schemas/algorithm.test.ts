import { describe, expect, it } from 'vitest';
import { AlgorithmGraphSchema } from './algorithm.js';

describe('AlgorithmGraphSchema', () => {
  it('accepts a small graph with a red flag and a disposition', () => {
    const graph = {
      nodes: [
        {
          id: 'n1',
          type: 'red_flag' as const,
          label: 'Hemodynamic instability?',
          claimIds: ['claim_1'],
          provenance: 'external' as const,
        },
        {
          id: 'n2',
          type: 'disposition' as const,
          label: 'Admit to monitored bed',
          claimIds: ['claim_2'],
          provenance: 'both' as const,
        },
      ],
      edges: [{ from: 'n1', to: 'n2', condition: { variable: 'sbp', op: '<' as const, value: 90 } }],
    };
    expect(AlgorithmGraphSchema.parse(graph)).toEqual(graph);
  });

  it('rejects a node with an unknown provenance', () => {
    const graph = {
      nodes: [
        { id: 'n1', type: 'assess', label: 'x', claimIds: [], provenance: 'unverified' },
      ],
      edges: [],
    };
    expect(() => AlgorithmGraphSchema.parse(graph)).toThrow();
  });
});
