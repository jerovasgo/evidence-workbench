// Shared kernel: the server-only Supabase client factory (AGENTS.md — "service role
// key server-only"). Each module brings its own repository/data-access code; this
// only hands out the client.
export * from './server';
