import { z } from 'zod';
import { describe, expect, it } from 'vitest';
import { toStructuredOutputFormat } from './json-schema.js';

describe('toStructuredOutputFormat', () => {
  it('converts a flat object schema with no $ref and no $schema wrapper', () => {
    const schema = z.object({ sentiment: z.enum(['positive', 'negative']) });
    const format = toStructuredOutputFormat('sentiment', schema);
    expect(format.schema).not.toHaveProperty('$schema');
    expect(JSON.stringify(format.schema)).not.toContain('$ref');
    expect(format.schema.type).toBe('object');
  });

  it('accepts the real MechanismGraph schema (flat by construction, module 08)', async () => {
    const { MechanismGraphSchema } = await import('../schemas/mechanism.js');
    expect(() => toStructuredOutputFormat('mechanism_graph', MechanismGraphSchema)).not.toThrow();
  });

  it('throws for a schema nested more than 10 levels deep', () => {
    let schema: z.ZodTypeAny = z.object({ leaf: z.string() });
    for (let i = 0; i < 11; i++) {
      schema = z.object({ child: schema });
    }
    expect(() => toStructuredOutputFormat('too_deep', schema)).toThrow(/depth .* > 10/);
  });
});
