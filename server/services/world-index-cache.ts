import { getWorldIndex, type WorldIndex } from "./world-index";

type world_index_cache_entry = {
  value: WorldIndex;
  cached_at: number;
};

function read_positive_integer_env(name: string, fallback: number): number {
  const raw = process.env[name];
  const parsed = raw ? Number(raw) : fallback;
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

const fresh_ttl_ms = read_positive_integer_env(
  "WORLD_INDEX_CACHE_FRESH_TTL_MS",
  5 * 60_000,
);
const stale_ttl_ms = Math.max(
  fresh_ttl_ms,
  read_positive_integer_env("WORLD_INDEX_CACHE_STALE_TTL_MS", 30 * 60_000),
);

let cached_entry: world_index_cache_entry | null = null;
let in_flight_build: Promise<WorldIndex> | null = null;

async function build_world_index(): Promise<WorldIndex> {
  const started_at = Date.now();
  const value = await getWorldIndex();
  cached_entry = { value, cached_at: Date.now() };
  console.warn("[WORLD_INDEX] projection_built", {
    build_duration_ms: Date.now() - started_at,
    node_count: value.nodes.length,
    edge_count: value.edges.length,
    fresh_ttl_ms,
    stale_ttl_ms,
  });
  return value;
}

function start_single_flight_build(): Promise<WorldIndex> {
  if (in_flight_build) return in_flight_build;

  in_flight_build = build_world_index().finally(() => {
    in_flight_build = null;
  });
  return in_flight_build;
}

/**
 * Returns the complete Lighthouse World Index without allowing concurrent page
 * loads to rebuild the same large projection independently.
 *
 * Fresh cache entries return immediately. Stale-but-usable entries return
 * immediately while one background rebuild refreshes the projection. A cold
 * process performs one shared build and all callers await that same promise.
 */
export async function get_cached_world_index(): Promise<WorldIndex> {
  const now = Date.now();
  const age_ms = cached_entry ? now - cached_entry.cached_at : null;

  if (cached_entry && age_ms !== null && age_ms <= fresh_ttl_ms) {
    return cached_entry.value;
  }

  if (cached_entry && age_ms !== null && age_ms <= stale_ttl_ms) {
    void start_single_flight_build().catch((error) => {
      console.warn(
        "[WORLD_INDEX] background_refresh_failed",
        error instanceof Error ? error.message : String(error),
      );
    });
    return cached_entry.value;
  }

  return start_single_flight_build();
}

export const __testing = {
  reset(): void {
    cached_entry = null;
    in_flight_build = null;
  },
  get_state() {
    return {
      has_cached_entry: cached_entry !== null,
      has_in_flight_build: in_flight_build !== null,
      fresh_ttl_ms,
      stale_ttl_ms,
    };
  },
};
