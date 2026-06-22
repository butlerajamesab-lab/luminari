import type { RuntimeUser } from "./user-resolver";

type CacheEntry = {
  user: RuntimeUser | null;
  cached_at: number;
};

const FRESH_TTL_MS = Number(process.env.AUTH_USER_CACHE_FRESH_TTL_MS || 60_000);
const STALE_TTL_MS = Number(process.env.AUTH_USER_CACHE_STALE_TTL_MS || 10 * 60_000);
const NEGATIVE_TTL_MS = Number(process.env.AUTH_USER_NEGATIVE_CACHE_TTL_MS || 15_000);
const cache = new Map<string, CacheEntry>();
const in_flight = new Map<string, Promise<RuntimeUser | null>>();

function now() {
  return Date.now();
}

function normalizeKey(key: string) {
  return key.trim().toLowerCase();
}

export function getCachedUser(key: string, allowStale = false): RuntimeUser | null {
  const normalized = normalizeKey(key);
  const entry = cache.get(normalized);
  if (!entry) return null;

  const age = now() - entry.cached_at;
  if (entry.user === null) {
    if (age <= NEGATIVE_TTL_MS) return null;
    cache.delete(normalized);
    return null;
  }
  if (age <= FRESH_TTL_MS) return entry.user;
  if (allowStale && age <= STALE_TTL_MS) return entry.user;

  cache.delete(normalized);
  return null;
}

export function setCachedUser(keys: Array<string | null | undefined>, user: RuntimeUser | null) {
  const entry: CacheEntry = { user, cached_at: now() };
  for (const key of keys) {
    if (!key?.trim()) continue;
    cache.set(normalizeKey(key), entry);
  }
}

export async function dedupeUserLookup(key: string, lookup: () => Promise<RuntimeUser | null>): Promise<RuntimeUser | null> {
  const normalized = normalizeKey(key);
  const existing = in_flight.get(normalized);
  if (existing) return existing;
  const promise = lookup().finally(() => in_flight.delete(normalized));
  in_flight.set(normalized, promise);
  return promise;
}
