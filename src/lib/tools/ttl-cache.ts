// Module 02: "cache 24h" for PubMed etc. A small in-memory TTL cache — no Redis/DB
// cache layer exists yet, so this is per-process only (same limitation as the budget
// guard: resets on restart, not shared across instances; tracked in SECURITY.md).

export interface TtlCache<T> {
  get(key: string): T | undefined;
  set(key: string, value: T): void;
}

interface Entry<T> {
  value: T;
  expiresAt: number;
}

export function createTtlCache<T>(ttlMs: number, now: () => number = Date.now): TtlCache<T> {
  const store = new Map<string, Entry<T>>();

  return {
    get(key) {
      const entry = store.get(key);
      if (!entry) return undefined;
      if (entry.expiresAt <= now()) {
        store.delete(key);
        return undefined;
      }
      return entry.value;
    },
    set(key, value) {
      store.set(key, { value, expiresAt: now() + ttlMs });
    },
  };
}
