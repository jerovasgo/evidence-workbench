import type { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import type { StructuredOutputFormat } from '@/shared/meta';

/**
 * Converts a zod schema to the flat JSON Schema the Meta API's structured output
 * requires: no $ref (so no recursive refs can sneak in) and depth <= 10
 * (docs/DAY0-VERIFICATION.md). Schemas with a genuine tree shape (e.g. MapNode) must be
 * sent through their flat variant (e.g. FlatMapNodeSchema) and nested in code — this
 * function does not do that rewriting for you, it only rejects a schema that is still
 * too deep.
 *
 * Discovered against the live API (not documented in DAY0-VERIFICATION.md): `strict:
 * true` requires every object's `required` to list ALL of its properties — a zod
 * `.optional()` field, which zod-to-json-schema simply omits from `required`, gets
 * rejected with HTTP 400 ("'required' is required to be supplied and to be an array
 * including every key in properties"). `makeEveryPropertyRequired` below applies the
 * standard workaround: every property is marked required, and the ones that were
 * actually optional are made nullable instead (type arrays gain `'null'`, `anyOf`
 * gains a `{type:'null'}` branch). The model then sends an explicit `null` for an
 * absent optional field; `stripNullFields` (used by runAgent before zod validation)
 * converts that back into "the key is simply not present", matching our zod schemas,
 * which all use plain `.optional()` and were not written expecting literal nulls.
 */
export function toStructuredOutputFormat(name: string, schema: z.ZodTypeAny): StructuredOutputFormat {
  const jsonSchema = zodToJsonSchema(schema, { $refStrategy: 'none' }) as Record<string, unknown>;
  delete jsonSchema.$schema;

  const strictSchema = makeEveryPropertyRequired(jsonSchema) as Record<string, unknown>;

  const depth = jsonSchemaDepth(strictSchema);
  if (depth > 10) {
    throw new Error(
      `toStructuredOutputFormat: schema "${name}" has depth ${depth} > 10, the Meta API limit. ` +
        'Flatten it (nodes[] + parentId) and nest in code instead — see src/lib/schemas/map.ts.',
    );
  }

  return { name, schema: strictSchema, strict: true };
}

interface JsonSchemaObjectNode {
  type?: string | string[];
  properties?: Record<string, unknown>;
  required?: string[];
  items?: unknown;
  anyOf?: unknown[];
  [key: string]: unknown;
}

function makeEveryPropertyRequired(node: unknown): unknown {
  if (!node || typeof node !== 'object') return node;
  const obj = node as JsonSchemaObjectNode;

  if (obj.type === 'object' && obj.properties) {
    const originalRequired = new Set(obj.required ?? []);
    const properties: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj.properties)) {
      const recursed = makeEveryPropertyRequired(value);
      properties[key] = originalRequired.has(key) ? recursed : makeNullable(recursed);
    }
    return { ...obj, properties, required: Object.keys(obj.properties) };
  }

  if (obj.items) {
    return { ...obj, items: makeEveryPropertyRequired(obj.items) };
  }

  if (obj.anyOf) {
    return { ...obj, anyOf: obj.anyOf.map(makeEveryPropertyRequired) };
  }

  return obj;
}

function makeNullable(schema: unknown): unknown {
  const obj = schema as JsonSchemaObjectNode;
  if (obj.anyOf) {
    return { anyOf: [...obj.anyOf, { type: 'null' }] };
  }
  if (Array.isArray(obj.type)) {
    return { ...obj, type: [...new Set([...obj.type, 'null'])] };
  }
  if (typeof obj.type === 'string') {
    return { ...obj, type: [obj.type, 'null'] };
  }
  return { anyOf: [schema, { type: 'null' }] };
}

/**
 * Converts an explicit `null` (sent by the model for an optional field under strict
 * mode) back into "the key is absent", recursively. Run on a structured-output
 * response before validating it against the original (plain-`.optional()`) zod schema.
 */
export function stripNullFields<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => stripNullFields(item)) as unknown as T;
  }
  if (value !== null && typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, entryValue] of Object.entries(value as Record<string, unknown>)) {
      if (entryValue === null) continue;
      result[key] = stripNullFields(entryValue);
    }
    return result as T;
  }
  return value;
}

function jsonSchemaDepth(node: unknown, seen: Set<unknown> = new Set()): number {
  if (!node || typeof node !== 'object' || seen.has(node)) return 0;
  seen.add(node);

  const obj = node as { properties?: Record<string, unknown>; items?: unknown };
  let max = 0;
  if (obj.properties) {
    for (const value of Object.values(obj.properties)) {
      max = Math.max(max, 1 + jsonSchemaDepth(value, seen));
    }
  }
  if (obj.items) {
    max = Math.max(max, 1 + jsonSchemaDepth(obj.items, seen));
  }
  return max;
}
