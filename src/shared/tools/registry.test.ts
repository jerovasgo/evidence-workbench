import { z } from 'zod';
import { describe, expect, it } from 'vitest';
import {
  createToolRegistry,
  ORCHESTRATOR_ONLY_TOOL_NAMES,
  registerStubTools,
  ToolNotImplementedError,
  ToolNotOnAllowListError,
  TOOL_NAMES,
  type ToolDefinition,
} from './registry';

function fakeTool(name: (typeof TOOL_NAMES)[number]): ToolDefinition {
  return {
    name,
    description: 'test tool',
    inputSchema: z.object({ q: z.string() }),
    outputSchema: z.object({ ok: z.boolean() }),
    timeoutMs: 1000,
    rateLimitPerMinute: 60,
    run: async () => ({ ok: true }),
  };
}

describe('createToolRegistry', () => {
  it('returns a registered tool when it is on the allow-list', () => {
    const registry = createToolRegistry();
    registry.register(fakeTool('pubmed_search'));
    expect(registry.getForAgent('pubmed_search', ['pubmed_search']).name).toBe('pubmed_search');
  });

  it('throws ToolNotOnAllowListError when the tool is registered but not allow-listed', () => {
    const registry = createToolRegistry();
    registry.register(fakeTool('pubmed_search'));
    expect(() => registry.getForAgent('pubmed_search', ['web_search'])).toThrow(ToolNotOnAllowListError);
  });

  it('listForAgent returns only the tools on the allow-list, in no particular extra set', () => {
    const registry = createToolRegistry();
    registry.register(fakeTool('pubmed_search'));
    registry.register(fakeTool('web_search'));
    const list = registry.listForAgent(['web_search']);
    expect(list.map((t) => t.name)).toEqual(['web_search']);
  });

  it('agents have no write tools: store_* names do not exist in the agent-facing ToolName union', () => {
    for (const orchestratorOnly of ORCHESTRATOR_ONLY_TOOL_NAMES) {
      expect(TOOL_NAMES).not.toContain(orchestratorOnly);
    }
  });
});

describe('registerStubTools', () => {
  it('registers all 12 tools from the module-00 table as not-yet-implemented stubs', async () => {
    const registry = createToolRegistry();
    const schemas = Object.fromEntries(
      TOOL_NAMES.map((name) => [name, { input: z.object({}), output: z.object({}) }]),
    ) as unknown as Parameters<typeof registerStubTools>[1];

    registerStubTools(registry, schemas);

    expect(TOOL_NAMES.length).toBe(12);
    for (const name of TOOL_NAMES) {
      const tool = registry.getForAgent(name, TOOL_NAMES);
      await expect(tool.run({})).rejects.toThrow(ToolNotImplementedError);
    }
  });
});
