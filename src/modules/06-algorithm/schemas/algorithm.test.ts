import { describe, expect, it } from 'vitest';
import { AlgorithmGraphSchema } from './algorithm';

describe('AlgorithmGraphSchema', () => {
  it('accepts a small graph with a critical check and an outcome', () => {
    const graph = {
      nodes: [
        {
          id: 'n1',
          type: 'critical_check' as const,
          label: 'Reagent air-sensitive?',
          claimIds: ['claim_1'],
          provenance: 'external' as const,
        },
        {
          id: 'n2',
          type: 'outcome' as const,
          label: 'Run under inert atmosphere',
          claimIds: ['claim_2'],
          provenance: 'both' as const,
        },
      ],
      edges: [{ from: 'n1', to: 'n2', condition: { variable: 'humidity', op: '<' as const, value: 5 } }],
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
