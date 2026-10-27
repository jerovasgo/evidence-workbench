import { describe, expect, it } from 'vitest';
import { MechanismGraphSchema } from './mechanism.js';

describe('MechanismGraphSchema', () => {
  it('accepts a minimal beta1-adrenergic to cAMP graph', () => {
    const graph = {
      scope: 'β1-adrenergic receptor -> Gs -> AC -> cAMP -> PKA',
      entities: [
        { id: 'b1ar', label: 'β1-adrenergic receptor', kind: 'receptor' as const, compartment: 'membrane' as const },
        { id: 'camp', label: 'cAMP', kind: 'second_messenger' as const, compartment: 'cytosol' as const },
      ],
      interactions: [
        {
          id: 'i1',
          from: 'b1ar',
          to: 'camp',
          type: 'produces' as const,
          sign: '+' as const,
          order: 1,
          claimId: 'claim_1',
        },
      ],
    };
    expect(MechanismGraphSchema.parse(graph)).toEqual(graph);
  });

  it('rejects an interaction with an unknown sign', () => {
    const graph = {
      scope: 'x',
      entities: [],
      interactions: [
        { id: 'i1', from: 'a', to: 'b', type: 'activates', sign: '++', order: 1, claimId: 'c1' },
      ],
    };
    expect(() => MechanismGraphSchema.parse(graph)).toThrow();
  });
});
