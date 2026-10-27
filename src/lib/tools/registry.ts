import type { z } from 'zod';

// Tool registry skeleton (docs/architecture/00-overview.md). Agents only ever see the
// tools on their own allow-list; `store_*` tools are orchestrator-only and are never
// returned to an agent, even if an allow-list names one by mistake — capability
// minimisation is enforced here, not trusted to callers (module 10).
//
// Each tool's `run` is a stub today: real implementations (PubMed, Europe PMC,
// Crossref, web fetch, UniProt/ChEBI/Reactome/GtoPdb, local full-text search) land
// with modules 02 and 08. This file only wires the shape so runAgent-era code can be
// written and tested against it now.

export const TOOL_NAMES = [
  'pubmed_search',
  'pubmed_fetch',
  'europe_pmc_search',
  'europe_pmc_fulltext',
  'crossref_lookup',
  'web_search',
  'fetch_url_text',
  'local_search',
  'uniprot_lookup',
  'chebi_lookup',
  'reactome_query',
  'gtopdb_query',
] as const;
export type ToolName = (typeof TOOL_NAMES)[number];

/** Orchestrator-only persistence tools. Never exposed to any agent allow-list. */
export const ORCHESTRATOR_ONLY_TOOL_NAMES = ['store_source', 'store_claim', 'store_run'] as const;
export type OrchestratorOnlyToolName = (typeof ORCHESTRATOR_ONLY_TOOL_NAMES)[number];

export interface ToolDefinition<TIn = unknown, TOut = unknown> {
  name: ToolName;
  description: string;
  inputSchema: z.ZodType<TIn>;
  outputSchema: z.ZodType<TOut>;
  timeoutMs: number;
  rateLimitPerMinute: number;
  run: (input: TIn) => Promise<TOut>;
}

export class ToolNotOnAllowListError extends Error {
  constructor(toolName: string) {
    super(`Tool "${toolName}" is not on this agent's allow-list`);
    this.name = 'ToolNotOnAllowListError';
  }
}

export class ToolNotImplementedError extends Error {
  constructor(toolName: string) {
    super(`Tool "${toolName}" has no implementation yet (module 02/08 fills this in)`);
    this.name = 'ToolNotImplementedError';
  }
}

export interface ToolRegistry {
  register(def: ToolDefinition): void;
  /** Throws ToolNotOnAllowListError if toolName is not in allowList. Never resolves an orchestrator-only tool. */
  getForAgent(toolName: ToolName, allowList: readonly ToolName[]): ToolDefinition;
  listForAgent(allowList: readonly ToolName[]): ToolDefinition[];
}

export function createToolRegistry(): ToolRegistry {
  const tools = new Map<ToolName, ToolDefinition>();

  return {
    register(def) {
      tools.set(def.name, def);
    },
    getForAgent(toolName, allowList) {
      if (!allowList.includes(toolName)) {
        throw new ToolNotOnAllowListError(toolName);
      }
      const def = tools.get(toolName);
      if (!def) {
        throw new Error(`Tool "${toolName}" is on the allow-list but was never registered`);
      }
      return def;
    },
    listForAgent(allowList) {
      return allowList
        .map((name) => tools.get(name))
        .filter((def): def is ToolDefinition => def !== undefined);
    },
  };
}

function notImplemented(name: ToolName): ToolDefinition['run'] {
  return async () => {
    throw new ToolNotImplementedError(name);
  };
}

/**
 * Registers every tool from the module-00 table as a stub. Call this once at startup;
 * module 02/08 will replace each `run` with a real implementation as it is built,
 * without changing this registration shape or any agent's allow-list.
 */
export function registerStubTools(registry: ToolRegistry, schemas: {
  [K in ToolName]: { input: z.ZodType; output: z.ZodType };
}): void {
  const defaults: Record<ToolName, { description: string; timeoutMs: number; rateLimitPerMinute: number }> = {
    pubmed_search: { description: 'E-utilities search for guideline/SR/RCT records', timeoutMs: 8000, rateLimitPerMinute: 60 },
    pubmed_fetch: { description: 'E-utilities record fetch by PMID', timeoutMs: 8000, rateLimitPerMinute: 60 },
    europe_pmc_search: { description: 'Open full-text search', timeoutMs: 8000, rateLimitPerMinute: 60 },
    europe_pmc_fulltext: { description: 'Open full-text article fetch', timeoutMs: 10000, rateLimitPerMinute: 60 },
    crossref_lookup: { description: 'DOI existence, metadata, retraction notices', timeoutMs: 6000, rateLimitPerMinute: 60 },
    web_search: { description: 'Meta Model API search grounding (discovery only)', timeoutMs: 10000, rateLimitPerMinute: 30 },
    fetch_url_text: { description: 'Fetch and extract readable text/PDF text from an allow-listed domain', timeoutMs: 10000, rateLimitPerMinute: 30 },
    local_search: { description: "Full-text search over the user's RLS-scoped pool", timeoutMs: 5000, rateLimitPerMinute: 60 },
    uniprot_lookup: { description: 'Gene/protein cross-reference (CC BY 4.0)', timeoutMs: 6000, rateLimitPerMinute: 60 },
    chebi_lookup: { description: 'Chemical entity cross-reference (CC BY 4.0)', timeoutMs: 6000, rateLimitPerMinute: 60 },
    reactome_query: { description: 'Pathway/reaction corroboration (data CC0)', timeoutMs: 6000, rateLimitPerMinute: 60 },
    gtopdb_query: { description: 'Pharmacology corroboration — optional, off by default (ODbL/CC BY-SA, commercial fee)', timeoutMs: 6000, rateLimitPerMinute: 30 },
  };

  for (const name of TOOL_NAMES) {
    const meta = defaults[name];
    registry.register({
      name,
      description: meta.description,
      inputSchema: schemas[name].input,
      outputSchema: schemas[name].output,
      timeoutMs: meta.timeoutMs,
      rateLimitPerMinute: meta.rateLimitPerMinute,
      run: notImplemented(name),
    });
  }
}
