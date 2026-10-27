import type { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import type { StructuredOutputFormat } from '../meta/client.js';

/**
 * Converts a zod schema to the flat JSON Schema the Meta API's structured output
 * requires: no $ref (so no recursive refs can sneak in) and depth <= 10
 * (docs/DAY0-VERIFICATION.md). Schemas with a genuine tree shape (e.g. MapNode) must be
 * sent through their flat variant (e.g. FlatMapNodeSchema) and nested in code — this
 * function does not do that rewriting for you, it only rejects a schema that is still
 * too deep.
 */
export function toStructuredOutputFormat(name: string, schema: z.ZodTypeAny): StructuredOutputFormat {
  const jsonSchema = zodToJsonSchema(schema, { $refStrategy: 'none' }) as Record<string, unknown>;
  delete jsonSchema.$schema;

  const depth = jsonSchemaDepth(jsonSchema);
  if (depth > 10) {
    throw new Error(
      `toStructuredOutputFormat: schema "${name}" has depth ${depth} > 10, the Meta API limit. ` +
        'Flatten it (nodes[] + parentId) and nest in code instead — see src/lib/schemas/map.ts.',
    );
  }

  return { name, schema: jsonSchema, strict: true };
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
