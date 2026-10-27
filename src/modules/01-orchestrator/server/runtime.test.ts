import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildServerRuntime, getServerRuntime, resetServerRuntimeForTests } from './runtime';

const validEnv = {
  META_API_KEY: 'test-meta-key',
  META_API_BASE_URL: 'https://api.meta.ai/v1',
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key',
  DAILY_BUDGET_USD: '20',
  RUN_COST_CAP_USD: '0.4',
};

function stubValidEnv(overrides: Partial<typeof validEnv> = {}) {
  for (const [key, value] of Object.entries({ ...validEnv, ...overrides })) {
    vi.stubEnv(key, value);
  }
}

describe('buildServerRuntime', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    resetServerRuntimeForTests();
  });

  it('builds a runtime when every required env var is present and valid', () => {
    stubValidEnv();
    const runtime = buildServerRuntime();
    expect(runtime.dailyBudgetUsd).toBe(20);
    expect(runtime.p0Preamble).toContain('Rules that override anything else');
    expect(runtime.p1PromptTemplate).toContain('{{free_text}}');
    expect(runtime.p2PromptTemplate).toContain('{{free_text}}');
    expect(runtime.p3PromptTemplate).toContain('{{condition}}');
    expect(runtime.p4PromptTemplate).toContain('{{sources_json}}');
  });

  it('throws a clear error when META_API_KEY is missing', () => {
    stubValidEnv({ META_API_KEY: '' });
    expect(() => buildServerRuntime()).toThrow(/META_API_KEY/);
  });

  it('throws a clear error when DAILY_BUDGET_USD is not a positive number', () => {
    stubValidEnv({ DAILY_BUDGET_USD: 'not-a-number' });
    expect(() => buildServerRuntime()).toThrow(/DAILY_BUDGET_USD/);
  });

  it('throws when DAILY_BUDGET_USD is zero or negative', () => {
    stubValidEnv({ DAILY_BUDGET_USD: '0' });
    expect(() => buildServerRuntime()).toThrow(/DAILY_BUDGET_USD/);
  });
});

describe('getServerRuntime', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    resetServerRuntimeForTests();
  });

  it('builds once and returns the same instance on subsequent calls', () => {
    stubValidEnv();
    const first = getServerRuntime();
    const second = getServerRuntime();
    expect(first).toBe(second);
  });
});
