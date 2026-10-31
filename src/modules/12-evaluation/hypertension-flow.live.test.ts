import { describe, expect, it, vi } from 'vitest';
import { writeFileSync } from 'node:fs';

vi.mock('next/headers', () => {
  const store = new Map<string, string>();
  return { cookies: vi.fn(async () => ({ get: (key: string) => store.has(key) ? { value: store.get(key) } : undefined, set: (key: string, value: string) => store.set(key, value) })) };
});

describe.skipIf(process.env.LIVE_HYPERTENSION !== '1')('live primary-hypertension synthesis', () => {
  it('retrieves evidence and produces a useful contextualized answer', async () => {
    process.loadEnvFile('.env.local');
    const { POST } = await import('@/app/api/runs/route');
    const { GET } = await import('@/app/api/runs/[id]/stream/route');
    const start = Date.now();
    const query = '¿Cuáles son los cinco genes más asociados con hipertensión primaria?';
    const response = await POST(new Request('http://localhost/api/runs', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ freeText: query, userId: null, depth: 'quick' }),
    }));
    const body = await response.json();
    const stream = await GET(new Request(`http://localhost${body.streamUrl}`), { params: Promise.resolve({ id: body.runId }) });
    const events: Record<string, unknown>[] = [];
    let buffer = '';
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
    writeFileSync('evals/genetics/hypertension-flow-live.json', JSON.stringify({ runId: body.runId, query, events }, null, 2));
    const opening = events.find((event) => event.type === 'opening_ready')?.text;
    expect(typeof opening).toBe('string');
    expect(String(opening)).toMatch(/gen|locus|variant/i);
    expect(String(opening)).not.toMatch(/no (?:hay|existe) evidencia suficiente para responder/i);
    const finalClaims = ((events.filter((event) => event.type === 'band_ready').at(-1)?.payload as { claims?: unknown[] } | undefined)?.claims ?? []);
    expect(finalClaims.length).toBeGreaterThan(0);
    expect(events.some((event) => event.type === 'done')).toBe(true);
  }, 240_000);
});
