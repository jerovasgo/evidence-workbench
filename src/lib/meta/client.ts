import { estimateCostUsd } from './prices.js';

// Wraps the Meta Model API Responses endpoint (docs/DAY0-VERIFICATION.md). This is the
// ONLY place in the codebase allowed to call api.meta.ai — CLAUDE.md §"Stack (decided)".

export type ReasoningEffort = 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' | 'max';
export type InputRole = 'system' | 'user' | 'assistant';

export interface MetaClientConfig {
  apiKey: string;
  baseUrl: string;
  /** Injectable for tests; defaults to the global fetch. */
  fetchImpl?: typeof fetch;
}

export interface StructuredOutputFormat {
  name: string;
  /** JSON Schema. Must not be recursive and must have depth <= 10 (Meta API constraint). */
  schema: Record<string, unknown>;
  strict?: boolean;
}

export interface RespondRequest {
  model: string;
  reasoningEffort: ReasoningEffort;
  input: { role: InputRole; content: string }[];
  outputFormat?: StructuredOutputFormat;
  /** Only 'web_search' is wired today; function tools land with module 02/03. */
  tools?: 'web_search'[];
  includeWebSearchResults?: boolean;
  maxOutputTokens?: number;
}

export interface WebSearchResult {
  title: string;
  url: string;
  snippet: string;
}

export interface RespondUsage {
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

export interface RespondResult {
  id: string;
  /** Last assistant message text, or null if the model only emitted tool calls. */
  text: string | null;
  /** JSON.parse(text), or null if text is absent or not valid JSON. */
  parsed: unknown;
  webSearchResults: WebSearchResult[];
  usage: RespondUsage;
  costUsd: number;
  /** Full response body for tracing. Callers must never log this with prompt/document content. */
  raw: unknown;
}

export class MetaApiError extends Error {
  readonly status: number;
  readonly body: unknown;

  constructor(message: string, status: number, body: unknown) {
    super(message);
    this.name = 'MetaApiError';
    this.status = status;
    this.body = body;
  }
}

/** CLAUDE.md: never use "Contributor" model variants (their content may train Meta models). */
export function assertNotContributorModel(model: string): void {
  if (model.endsWith('-contributor')) {
    throw new Error(`Refusing to call contributor model variant "${model}" (CLAUDE.md non-negotiable rule)`);
  }
}

export interface MetaClient {
  respond(request: RespondRequest): Promise<RespondResult>;
  listModels(): Promise<{ id: string }[]>;
}

export function createMetaClient(config: MetaClientConfig): MetaClient {
  const fetchImpl = config.fetchImpl ?? fetch;

  async function respond(request: RespondRequest): Promise<RespondResult> {
    assertNotContributorModel(request.model);

    const body: Record<string, unknown> = {
      model: request.model,
      reasoning: { effort: request.reasoningEffort },
      input: request.input,
    };

    if (request.outputFormat) {
      body.text = {
        format: {
          type: 'json_schema',
          name: request.outputFormat.name,
          schema: request.outputFormat.schema,
          strict: request.outputFormat.strict ?? true,
        },
      };
    }

    const usesWebSearch = request.tools?.includes('web_search') ?? false;
    if (usesWebSearch) {
      body.tools = [{ type: 'web_search' }];
      if (request.includeWebSearchResults) {
        body.include = ['web_search_call.results'];
      }
    }

    if (request.maxOutputTokens !== undefined) {
      body.max_output_tokens = request.maxOutputTokens;
    }

    const res = await fetchImpl(`${config.baseUrl}/responses`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    const json = await res.json();
    if (!res.ok) {
      throw new MetaApiError(`Meta API responded with HTTP ${res.status}`, res.status, json);
    }

    return parseResponsesPayload(json, request.model);
  }

  async function listModels(): Promise<{ id: string }[]> {
    const res = await fetchImpl(`${config.baseUrl}/models`, {
      headers: { Authorization: `Bearer ${config.apiKey}` },
    });
    const json = await res.json();
    if (!res.ok) {
      throw new MetaApiError(`Meta API responded with HTTP ${res.status}`, res.status, json);
    }
    const data = (json as { data?: { id: string }[] }).data;
    return data ?? [];
  }

  return { respond, listModels };
}

interface ResponsesOutputMessageContent {
  type: string;
  text?: string;
}

interface ResponsesOutputItem {
  type: string;
  role?: string;
  content?: ResponsesOutputMessageContent[];
  results?: { title?: string; url?: string; snippet?: string }[];
}

interface ResponsesPayload {
  id: string;
  output: ResponsesOutputItem[];
  usage: {
    input_tokens: number;
    output_tokens: number;
    total_tokens: number;
    input_tokens_details?: { cached_tokens?: number };
  };
}

function parseResponsesPayload(json: unknown, model: string): RespondResult {
  const payload = json as ResponsesPayload;

  const messageItem = payload.output.find((item) => item.type === 'message' && item.role === 'assistant');
  const text =
    messageItem?.content?.find((c) => c.type === 'output_text')?.text ?? null;

  const webSearchResults: WebSearchResult[] = payload.output
    .filter((item) => item.type === 'web_search_call')
    .flatMap((item) => item.results ?? [])
    .map((r) => ({ title: r.title ?? '', url: r.url ?? '', snippet: r.snippet ?? '' }));

  let parsed: unknown = null;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = null;
    }
  }

  const cachedInputTokens = payload.usage.input_tokens_details?.cached_tokens ?? 0;
  const usage: RespondUsage = {
    inputTokens: payload.usage.input_tokens,
    cachedInputTokens,
    outputTokens: payload.usage.output_tokens,
    totalTokens: payload.usage.total_tokens,
  };

  let costUsd = 0;
  try {
    costUsd = estimateCostUsd(
      model,
      { inputTokens: usage.inputTokens, cachedInputTokens: usage.cachedInputTokens, outputTokens: usage.outputTokens },
      webSearchResults.length > 0 ? 1 : 0,
    );
  } catch {
    // No price table entry for this model yet (docs/DAY0-VERIFICATION.md lists only
    // muse-spark-1.3 and muse-wonder-1.0). Record zero rather than guessing a price.
    costUsd = 0;
  }

  return { id: payload.id, text, parsed, webSearchResults, usage, costUsd, raw: json };
}
