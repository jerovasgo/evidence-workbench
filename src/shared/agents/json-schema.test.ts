import { z } from 'zod';
import { describe, expect, it } from 'vitest';
import { stripNullFields, toStructuredOutputFormat } from './json-schema';

describe('toStructuredOutputFormat', () => {
  it('converts a flat object schema with no $ref and no $schema wrapper', () => {
    const schema = z.object({ sentiment: z.enum(['positive', 'negative']) });
    const format = toStructuredOutputFormat('sentiment', schema);
    expect(format.schema).not.toHaveProperty('$schema');
    expect(JSON.stringify(format.schema)).not.toContain('$ref');
    expect(format.schema.type).toBe('object');
  });

  it('accepts a flat-by-construction graph schema (entities[]/interactions[] referencing ids, no nesting)', () => {
    // Shaped like module 08's MechanismGraph, defined locally rather than imported
    // from that module — shared/agents must not depend on any module (see
    // scripts/check-module-boundaries.mjs).
    const graphSchema = z.object({
      scope: z.string(),
      entities: z.array(z.object({ id: z.string(), label: z.string() })),
      interactions: z.array(z.object({ id: z.string(), from: z.string(), to: z.string() })),
    });
    expect(() => toStructuredOutputFormat('graph', graphSchema)).not.toThrow();
  });

  it('throws for a schema nested more than 10 levels deep', () => {
    let schema: z.ZodTypeAny = z.object({ leaf: z.string() });
    for (let i = 0; i < 11; i++) {
      schema = z.object({ child: schema });
    }
    expect(() => toStructuredOutputFormat('too_deep', schema)).toThrow(/depth .* > 10/);
  });

  // Discovered against the live Meta API: strict mode (HTTP 400) requires every
  // object's `required` to list ALL of its properties, so a plain zod `.optional()`
  // field (omitted from `required` by zod-to-json-schema) must become nullable instead.
  it('marks every property required and makes the originally-optional ones nullable', () => {
    const schema = z.object({
      intent: z.enum(['a', 'b']),
      secondary: z.enum(['a', 'b']).optional(),
      confidence: z.enum(['high', 'low']),
    });
    const format = toStructuredOutputFormat('router', schema);

    expect(format.schema.required).toEqual(['intent', 'secondary', 'confidence']);
    const properties = format.schema.properties as Record<string, { type?: string | string[] }>;
    expect(properties.intent?.type).toBe('string'); // originally required: untouched
    expect(properties.secondary?.type).toEqual(['string', 'null']); // originally optional: now nullable
  });

  it('adds null to the type array for an optional primitive-union field (e.g. Condition.value)', () => {
    // zod-to-json-schema collapses z.union([z.string(), z.number()]) into a type array
    // rather than anyOf; the fix must handle both shapes.
    const schema = z.object({
      value: z.union([z.string(), z.number()]).optional(),
      op: z.enum(['<', '>']),
    });
    const format = toStructuredOutputFormat('condition', schema);
    const properties = format.schema.properties as Record<string, { type?: string[] }>;
    expect(properties.value?.type).toContain('null');
  });

  it('adds a null branch to anyOf for an optional union-of-objects field', () => {
    const schema = z.object({
      payload: z
        .union([z.object({ a: z.string() }), z.object({ b: z.string() })])
        .optional(),
    });
    const format = toStructuredOutputFormat('payload_union', schema);
    const properties = format.schema.properties as Record<string, { anyOf?: { type?: string }[] }>;
    expect(properties.payload?.anyOf?.some((branch) => branch.type === 'null')).toBe(true);
  });

  it('applies the required/nullable fix recursively to nested objects', () => {
    const schema = z.object({
      outer: z.object({
        innerOptional: z.string().optional(),
      }),
    });
    const format = toStructuredOutputFormat('nested', schema);
    const outer = (format.schema.properties as Record<string, { required?: string[] }>).outer;
    expect(outer?.required).toEqual(['innerOptional']);
  });
});

describe('stripNullFields', () => {
  it('removes keys whose value is null, recursively', () => {
    expect(stripNullFields({ a: 1, b: null, c: { d: null, e: 2 } })).toEqual({ a: 1, c: { e: 2 } });
  });

  it('leaves arrays and their elements intact (only object keys are stripped)', () => {
    expect(stripNullFields({ list: [{ a: null, b: 1 }] })).toEqual({ list: [{ b: 1 }] });
  });

  it('passes primitives through unchanged', () => {
    expect(stripNullFields('x')).toBe('x');
    expect(stripNullFields(5)).toBe(5);
    expect(stripNullFields(null)).toBe(null);
  });
});
