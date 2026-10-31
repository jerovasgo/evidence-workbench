import { describe, expect, it, vi } from 'vitest';
import { writeFileSync } from 'node:fs';
vi.mock('next/headers', () => {
  const store = new Map<string, string>();
  return { cookies: vi.fn(async () => ({ get: (key: string) => store.has(key) ? { value: store.get(key) } : undefined, set: (key: string, value: string) => store.set(key, value) })) };
});
// Explicitly enabled integration run: real providers, persistence, routing and SSE.
// Only Next's request-local cookie adapter is substituted in this harness.
describe.skipIf(process.env.LIVE_HYPOXIA !== '1')('live hypoxia comparison', () => {
  it('retrieves, verifies, synthesizes and compares the actual user question', async () => {
    process.loadEnvFile('.env.local');
    const { POST } = await import('@/app/api/runs/route');
    const { GET } = await import('@/app/api/runs/[id]/stream/route');
    const start = Date.now();
    const response = await POST(new Request('http://localhost/api/runs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ freeText: 'Compara estudios de expresión génica bajo hipoxia', userId: null, depth: 'quick' }) }));
    const body = await response.json();
    expect(body.intent).toBe('comparison');
    const stream = await GET(new Request(`http://localhost${body.streamUrl}`), { params: Promise.resolve({ id: body.runId }) });
    const events: Record<string, unknown>[] = [];
    let buffer = '';
    // `.getReader()` instead of `for await...of` — Node's ReadableStream is
    // async-iterable at runtime, but the "dom" lib types don't declare it.
    const reader = stream.body!.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += new TextDecoder().decode(value);
      let end: number;
      while ((end = buffer.indexOf('\n\n')) >= 0) {
        const block = buffer.slice(0, end); buffer = buffer.slice(end + 2);
        if (block.startsWith('data: ')) events.push({ ms: Date.now() - start, ...JSON.parse(block.slice(6)) });
      }
    }
    writeFileSync('evals/genetics/hypoxia-flow-live.json', JSON.stringify({ runId: body.runId, events }, null, 2));
    expect(events.filter((event) => event.type === 'opening_ready')).toHaveLength(1);
    const bands = events.filter((event) => event.type === 'band_ready');
    const finalClaims = (bands.at(-1)?.payload as { claims: { sourceId: string; actionType: string }[] }).claims;
    expect(new Set(finalClaims.map((claim) => claim.sourceId)).size).toBeGreaterThanOrEqual(2);
    // Regression guard (2026-10-30, evals/genetics/FINDINGS.md): a prior run returned
    // only 'method'/'mechanism' claims for this exact question — a plausible-looking
    // but useless answer to "which genes show differential expression under hypoxia."
    // At least one claim must actually be a finding, not just method/background detail.
    expect(finalClaims.some((claim) => claim.actionType === 'finding')).toBe(true);
    expect(events.some((event) => event.type === 'relations_ready')).toBe(true);
    const replay = await GET(new Request(`http://localhost${body.streamUrl}`), { params: Promise.resolve({ id: body.runId }) });
    const replayText = await replay.text();
    expect(replayText).toContain(JSON.stringify(events.find((event) => event.type === 'opening_ready')?.text));
  }, 240_000);
});
