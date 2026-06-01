import type { User } from "../../drizzle/schema";

type CacheEntry = {
  user: User;
  cachedAt: number;
};

const FRESH_TTL_MS = Number(process.env.AUTH_USER_CACHE_FRESH_TTL_MS || 60_000);
const STALE_TTL_MS = Number(process.env.AUTH_USER_CACHE_STALE_TTL_MS || 10 * 60_000);
const cache = new Map<string, CacheEntry>();

function now() {
  return Date.now();
}

function normalizeKey(key: string) {
  return key.trim().toLowerCase();
}

export function getCachedUser(key: string, allowStale = false): User | null {
  const normalized = normalizeKey(key);
  const entry = cache.get(normalized);
  if (!entry) return null;

  const age = now() - entry.cachedAt;
  if (age <= FRESH_TTL_MS) return entry.user;
  if (allowStale && age <= STALE_TTL_MS) return entry.user;

  cache.delete(normalized);
  return null;
}

export function setCachedUser(keys: Array<string | null | undefined>, user: User | null) {
  if (!user) return;
  const entry: CacheEntry = { user, cachedAt: now() };
  for (const key of keys) {
    if (!key?.trim()) continue;
    cache.set(normalizeKey(key), entry);
  }
}
