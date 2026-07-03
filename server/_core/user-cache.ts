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

function normalize_key(key: string) {
  return key.trim().toLowerCase();
}

export function get_cached_user(key: string, allow_stale = false): RuntimeUser | null {
  const normalized = normalize_key(key);
  const entry = cache.get(normalized);
  if (!entry) return null;

  const age = now() - entry.cached_at;
  if (entry.user === null) {
    if (age <= NEGATIVE_TTL_MS) return null;
    cache.delete(normalized);
    return null;
  }
  if (age <= FRESH_TTL_MS) return entry.user;
  if (allow_stale && age <= STALE_TTL_MS) return entry.user;

  cache.delete(normalized);
  return null;
}

export function set_cached_user(keys: Array<string | null | undefined>, user: RuntimeUser | null) {
  const entry: CacheEntry = { user, cached_at: now() };
  for (const key of keys) {
    if (!key?.trim()) continue;
    cache.set(normalize_key(key), entry);
  }
}

export async function dedupe_user_lookup(key: string, lookup: () => Promise<RuntimeUser | null>): Promise<RuntimeUser | null> {
  const normalized = normalize_key(key);
  const existing = in_flight.get(normalized);
  if (existing) {
    console.warn("[CONTEXT] profile_lookup_in_flight_dedupe_hit", {
      cache_key: normalized,
      duplicate_lookup_suppressed: true,
      in_flight_count: in_flight.size,
    });
    return existing;
  }

  const promise = Promise.resolve()
    .then(lookup)
    .finally(() => in_flight.delete(normalized));

  in_flight.set(normalized, promise);
  console.warn("[CONTEXT] profile_lookup_in_flight_registered", {
    cache_key: normalized,
    duplicate_lookup_suppressed: false,
    in_flight_count: in_flight.size,
  });
  return promise;
}
