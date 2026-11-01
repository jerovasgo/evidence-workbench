import { describe, expect, it } from 'vitest';
import type { MechanismGraph } from '../schemas/mechanism';
import { validateMechanismGraph } from './mechanism';

function entity(overrides: Partial<MechanismGraph['entities'][number]> & { id: string; kind: MechanismGraph['entities'][number]['kind'] }) {
  return { label: overrides.id, ...overrides };
}

function interaction(overrides: Partial<MechanismGraph['interactions'][number]> & { id: string; from: string; to: string; claimId: string }) {
  return { type: 'activates' as const, sign: '+' as const, order: 0, ...overrides };
}

describe('validateMechanismGraph', () => {
  const verifiedClaimIds = new Set(['claim_1', 'claim_2']);

  it('passes a well-formed ligand -> receptor -> second messenger graph', () => {
    const graph: MechanismGraph = {
      scope: 'test pathway',
      entities: [entity({ id: 'e1', kind: 'ligand' }), entity({ id: 'e2', kind: 'receptor' }), entity({ id: 'e3', kind: 'second_messenger' })],
      interactions: [
        interaction({ id: 'i1', from: 'e1', to: 'e2', claimId: 'claim_1' }),
        interaction({ id: 'i2', from: 'e2', to: 'e3', claimId: 'claim_2', order: 1 }),
      ],
    };
    expect(validateMechanismGraph(graph, verifiedClaimIds)).toEqual({ ok: true, violations: [] });
  });

  it('flags an interaction citing an unknown claim id', () => {
    const graph: MechanismGraph = {
      scope: 'test',
      entities: [entity({ id: 'e1', kind: 'ligand' }), entity({ id: 'e2', kind: 'receptor' })],
      interactions: [interaction({ id: 'i1', from: 'e1', to: 'e2', claimId: 'claim_999' })],
    };
    const result = validateMechanismGraph(graph, verifiedClaimIds);
    expect(result.ok).toBe(false);
    expect(result.violations).toContainEqual({ kind: 'claim_id_not_in_pool', interactionId: 'i1', claimId: 'claim_999' });
  });

  it('flags an interaction referencing an entity id that does not exist', () => {
    const graph: MechanismGraph = {
      scope: 'test',
      entities: [entity({ id: 'e1', kind: 'ligand' })],
      interactions: [interaction({ id: 'i1', from: 'e1', to: 'ghost', claimId: 'claim_1' })],
    };
    const result = validateMechanismGraph(graph, verifiedClaimIds);
    expect(result.violations).toContainEqual({ kind: 'unknown_entity_ref', interactionId: 'i1', entityId: 'ghost', end: 'to' });
  });

  it('flags an entity that plays no role in any interaction', () => {
    const graph: MechanismGraph = {
      scope: 'test',
      entities: [entity({ id: 'e1', kind: 'ligand' }), entity({ id: 'e2', kind: 'receptor' }), entity({ id: 'e3', kind: 'other' })],
      interactions: [interaction({ id: 'i1', from: 'e1', to: 'e2', claimId: 'claim_1' })],
    };
    const result = validateMechanismGraph(graph, verifiedClaimIds);
    expect(result.violations).toContainEqual({ kind: 'orphan_entity', entityId: 'e3' });
  });

  it('flags graphs over the entity/interaction budget', () => {
    const entities = Array.from({ length: 26 }, (_, i) => entity({ id: `e${i}`, kind: 'other' }));
    const graph: MechanismGraph = { scope: 'test', entities, interactions: [] };
    const result = validateMechanismGraph(graph, verifiedClaimIds);
    expect(result.violations).toContainEqual({ kind: 'entity_cap_exceeded', count: 26, cap: 25 });
  });
});
