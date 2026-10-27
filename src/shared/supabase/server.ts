import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// CLAUDE.md / module 10: "service role key server-only ... Meta API key only in route
// handlers". This module must never end up in a client bundle. There is no build-time
// enforcement yet (module 10's own build note calls for a client-bundle grep in CI,
// not built today) — this is a runtime guard as defense in depth.

export class ServerOnlyModuleError extends Error {}

function assertServerOnly(): void {
  if (typeof window !== 'undefined') {
    throw new ServerOnlyModuleError(
      'src/lib/supabase/server.ts must never run in a browser bundle (service role key is server-only).',
    );
  }
}

export interface SupabaseServerConfig {
  url: string;
  serviceRoleKey: string;
}

/**
 * Creates a Supabase client authenticated as `service_role`, which bypasses RLS
 * entirely (supabase/migrations/0001_init_core_schema.sql). Only ever call this from
 * a route handler or server-only module, never from anything that could be bundled
 * for the browser.
 */
export function createServiceRoleClient(config: SupabaseServerConfig): SupabaseClient {
  assertServerOnly();
  if (!config.url) {
    throw new Error('SUPABASE_URL is required to create a Supabase client');
  }
  if (!config.serviceRoleKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is required to create a service-role client');
  }
  return createClient(config.url, config.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
