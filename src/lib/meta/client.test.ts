import { describe, expect, it, vi } from 'vitest';
import { createMetaClient, MetaApiError } from './client.js';

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

describe('createMetaClient.respond', () => {
  it('parses a structured-output response and computes its cost', async () => {
    // Real shape captured during Day 1 re-verification (docs/DAY0-VERIFICATION.md §3).
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse(200, {
        id: 'resp_1',
        output: [
          { type: 'reasoning', status: 'completed' },
          {
            type: 'message',
            role: 'assistant',
            content: [{ type: 'output_text', text: '{"sentiment":"positive"}' }],
          },
        ],
        usage: { input_tokens: 22, output_tokens: 73, total_tokens: 95, input_tokens_details: { cached_tokens: 0 } },
      }),
    );
    const client = createMetaClient({ apiKey: 'k', baseUrl: 'https://api.meta.ai/v1', fetchImpl });

    const result = await client.respond({
      model: 'muse-spark-1.3',
      reasoningEffort: 'minimal',
      input: [{ role: 'user', content: 'classify sentiment' }],
      outputFormat: { name: 'sentiment', schema: { type: 'object' } },
    });

    expect(result.text).toBe('{"sentiment":"positive"}');
    expect(result.parsed).toEqual({ sentiment: 'positive' });
    expect(result.usage).toEqual({ inputTokens: 22, cachedInputTokens: 0, outputTokens: 73, totalTokens: 95 });
    expect(result.costUsd).toBeGreaterThan(0);

    const [, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    const sentBody = JSON.parse(init.body as string);
    expect(sentBody.text.format.type).toBe('json_schema');
    expect(sentBody.model).toBe('muse-spark-1.3');
  });

  it('forwards maxOutputTokens as max_output_tokens in the request body', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse(200, {
        id: 'resp_4',
        output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: '{}' }] }],
        usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 },
      }),
    );
    const client = createMetaClient({ apiKey: 'k', baseUrl: 'https://api.meta.ai/v1', fetchImpl });

    await client.respond({
      model: 'muse-spark-1.3',
      reasoningEffort: 'low',
      input: [{ role: 'user', content: 'x' }],
      maxOutputTokens: 500,
    });

    const [, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(init.body as string).max_output_tokens).toBe(500);
  });

  it('extracts web_search_call results when the web_search tool is used', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse(200, {
        id: 'resp_2',
        output: [
          {
            type: 'web_search_call',
            results: [{ title: 'Headline', url: 'https://example.org/a', snippet: '' }],
          },
          {
            type: 'message',
            role: 'assistant',
            content: [{ type: 'output_text', text: 'Here is the headline.' }],
          },
        ],
        usage: { input_tokens: 10, output_tokens: 5, total_tokens: 15 },
      }),
    );
    const client = createMetaClient({ apiKey: 'k', baseUrl: 'https://api.meta.ai/v1', fetchImpl });

    const result = await client.respond({
      model: 'muse-spark-1.3',
      reasoningEffort: 'low',
      input: [{ role: 'user', content: 'search something' }],
      tools: ['web_search'],
      includeWebSearchResults: true,
    });

    expect(result.webSearchResults).toEqual([{ title: 'Headline', url: 'https://example.org/a', snippet: '' }]);
    expect(result.parsed).toBeNull();
    expect(result.text).toBe('Here is the headline.');
  });

  it('throws MetaApiError on a non-2xx response without retrying itself', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(429, { message: 'rate limited' }));
    const client = createMetaClient({ apiKey: 'k', baseUrl: 'https://api.meta.ai/v1', fetchImpl });

    await expect(
      client.respond({ model: 'muse-spark-1.3', reasoningEffort: 'low', input: [{ role: 'user', content: 'x' }] }),
    ).rejects.toThrow(MetaApiError);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('refuses to call a -contributor model variant and never hits the network', async () => {
    const fetchImpl = vi.fn();
    const client = createMetaClient({ apiKey: 'k', baseUrl: 'https://api.meta.ai/v1', fetchImpl });

    await expect(
      client.respond({
        model: 'muse-spark-1.3-contributor',
        reasoningEffort: 'low',
        input: [{ role: 'user', content: 'x' }],
      }),
    ).rejects.toThrow(/contributor/);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('falls back to costUsd = 0 for a model with no price table entry, instead of throwing', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse(200, {
        id: 'resp_3',
        output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'ok' }] }],
        usage: { input_tokens: 5, output_tokens: 5, total_tokens: 10 },
      }),
    );
    const client = createMetaClient({ apiKey: 'k', baseUrl: 'https://api.meta.ai/v1', fetchImpl });

    const result = await client.respond({ model: 'sam-3.1', reasoningEffort: 'low', input: [{ role: 'user', content: 'x' }] });
    expect(result.costUsd).toBe(0);
  });
});

describe('createMetaClient.listModels', () => {
  it('returns the live model ids', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse(200, { data: [{ id: 'muse-spark-1.3' }, { id: 'muse-spark-1.3-contributor' }] }),
    );
    const client = createMetaClient({ apiKey: 'k', baseUrl: 'https://api.meta.ai/v1', fetchImpl });

    const models = await client.listModels();
    expect(models.map((m) => m.id)).toContain('muse-spark-1.3');
  });

  it('throws MetaApiError on failure', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(401, { message: 'invalid key' }));
    const client = createMetaClient({ apiKey: 'bad', baseUrl: 'https://api.meta.ai/v1', fetchImpl });

    await expect(client.listModels()).rejects.toThrow(MetaApiError);
  });
});
