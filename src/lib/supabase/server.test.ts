import { afterEach, describe, expect, it, vi } from 'vitest';
import { createServiceRoleClient, ServerOnlyModuleError } from './server';

describe('createServiceRoleClient', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('creates a client when url and serviceRoleKey are both present', () => {
    const client = createServiceRoleClient({
      url: 'https://example.supabase.co',
      serviceRoleKey: 'fake-service-role-key',
    });
    expect(typeof client.from).toBe('function');
  });

  it('throws when serviceRoleKey is missing', () => {
    expect(() => createServiceRoleClient({ url: 'https://example.supabase.co', serviceRoleKey: '' })).toThrow(
      /SUPABASE_SERVICE_ROLE_KEY/,
    );
  });

  it('throws when url is missing', () => {
    expect(() => createServiceRoleClient({ url: '', serviceRoleKey: 'k' })).toThrow(/SUPABASE_URL/);
  });

  it('refuses to run if a `window` global is present (browser bundle guard)', () => {
    vi.stubGlobal('window', {});
    expect(() => createServiceRoleClient({ url: 'https://example.supabase.co', serviceRoleKey: 'k' })).toThrow(
      ServerOnlyModuleError,
    );
  });
});
