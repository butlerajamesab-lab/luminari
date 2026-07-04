type CacheStatus = "hit" | "miss" | "coalesced" | "stale";

export type RuntimeReadThroughCacheOptions = {
  ttl_ms?: number;
  stale_ttl_ms?: number;
  now?: () => number;
};

export type RuntimeReadThroughCacheResult<T> = {
  payload: T;
  cache_status: CacheStatus;
};

type CacheEntry<T> = {
  expires_at: number;
  stale_until: number;
  payload: T;
};

export class RuntimeReadThroughCache<T = unknown> {
  private readonly ttl_ms: number;
  private readonly stale_ttl_ms: number;
  private readonly now: () => number;
  private readonly cache = new Map<string, CacheEntry<T>>();
  private readonly in_flight = new Map<string, Promise<T>>();

  constructor(options: RuntimeReadThroughCacheOptions = {}) {
    this.ttl_ms = Math.max(0, options.ttl_ms ?? 15_000);
    this.stale_ttl_ms = Math.max(this.ttl_ms, options.stale_ttl_ms ?? 120_000);
    this.now = options.now ?? Date.now;
  }

  async get(key: string, loader: () => Promise<T>): Promise<RuntimeReadThroughCacheResult<T>> {
    const now = this.now();
    const cached = this.cache.get(key);
    if (cached && cached.expires_at > now) {
      return { payload: cached.payload, cache_status: "hit" };
    }

    const existing = this.in_flight.get(key);
    if (existing) {
      return { payload: await existing, cache_status: "coalesced" };
    }

    const promise = loader();
    this.in_flight.set(key, promise);
    try {
      const payload = await promise;
      this.cache.set(key, {
        payload,
        expires_at: now + this.ttl_ms,
        stale_until: now + this.stale_ttl_ms,
      });
      return { payload, cache_status: "miss" };
    } catch (error) {
      if (cached && cached.stale_until > now) {
        return { payload: cached.payload, cache_status: "stale" };
      }
      throw error;
    } finally {
      this.in_flight.delete(key);
    }
  }

  clear(key?: string): void {
    if (key) {
      this.cache.delete(key);
      return;
    }
    this.cache.clear();
  }

  stats() {
    return {
      cache_entries: this.cache.size,
      in_flight: this.in_flight.size,
      ttl_ms: this.ttl_ms,
      stale_ttl_ms: this.stale_ttl_ms,
    };
  }
}

export function runtime_cache_key(name: string, params: Record<string, unknown> = {}) {
  return `${name}:${JSON.stringify(params)}`;
}
