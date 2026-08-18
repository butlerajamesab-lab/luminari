import { query_with_diagnostics } from "./db";

const DEFAULT_INTERVAL_MS = 15 * 60 * 1000;
const MIN_INTERVAL_MS = 5 * 60 * 1000;
const MAX_INTERVAL_MS = 24 * 60 * 60 * 1000;
const DEFAULT_BATCH_SIZE = 5;
const MAX_BATCH_SIZE = 10;
const INITIAL_DELAY_MS = 30_000;
const REQUEST_TIMEOUT_MS = 180_000;
const WARM_STATE_DELAY_MS = 750;
const STATE_CACHE_TTL_MS = 8 * 60 * 60 * 1000;

let interval_timer: NodeJS.Timeout | null = null;
let initial_timer: NodeJS.Timeout | null = null;
let cycle_running = false;
let stopped = false;

type docket_cache_status_row = {
  state: string;
  has_cache: boolean;
  fetched_at: string | null;
  is_fresh: boolean;
};

type docket_cache_database_row = {
  state: string;
  fetched_at: string | Date | null;
};

function bounded_integer(
  input: string | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  const parsed = Number.parseInt(input ?? "", 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(minimum, Math.min(maximum, parsed));
}

function warmer_enabled(): boolean {
  const configured = process.env.DOCKET_STATE_CACHE_WARMER_ENABLED
    ?.trim()
    .toLowerCase();
  if (configured === "false") return false;
  if (configured === "true") return true;
  return process.env.NODE_ENV === "production";
}

function interval_ms(): number {
  return bounded_integer(
    process.env.DOCKET_STATE_CACHE_WARMER_INTERVAL_MS,
    DEFAULT_INTERVAL_MS,
    MIN_INTERVAL_MS,
    MAX_INTERVAL_MS,
  );
}

function batch_size(): number {
  return bounded_integer(
    process.env.DOCKET_STATE_CACHE_WARMER_BATCH_SIZE,
    DEFAULT_BATCH_SIZE,
    1,
    MAX_BATCH_SIZE,
  );
}

function safe_error(error: unknown): string {
  return error instanceof Error
    ? error.message.slice(0, 500)
    : "unknown_docket_state_cache_warmer_failure";
}

function fetched_at_ms(value: string | null): number {
  if (!value) return Number.NEGATIVE_INFINITY;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : Number.NEGATIVE_INFINITY;
}

function normalized_fetched_at(value: string | Date | null): string | null {
  if (value instanceof Date) return value.toISOString();
  if (typeof value !== "string" || !value.trim()) return null;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Recovery order is coverage-first, then freshness:
 * 1. jurisdictions with no cache at all;
 * 2. cached-but-stale jurisdictions, oldest observation first;
 * 3. state code as a deterministic tie-breaker.
 *
 * Fresh jurisdictions are never selected by the automatic recovery loop.
 */
export function sort_docket_warm_candidates(
  states: docket_cache_status_row[],
): docket_cache_status_row[] {
  return states
    .filter(row => row.is_fresh !== true)
    .sort((a, b) => {
      if (a.has_cache !== b.has_cache) return a.has_cache ? 1 : -1;
      if (a.has_cache && b.has_cache) {
        const a_fetched_at = fetched_at_ms(a.fetched_at);
        const b_fetched_at = fetched_at_ms(b.fetched_at);
        if (a_fetched_at < b_fetched_at) return -1;
        if (a_fetched_at > b_fetched_at) return 1;
      }
      return a.state.localeCompare(b.state);
    });
}

async function parse_json_response(
  response: Response,
  error_code: string,
): Promise<Record<string, unknown>> {
  const body = await response.text();
  try {
    return body ? JSON.parse(body) as Record<string, unknown> : {};
  } catch {
    throw new Error(`${error_code}_invalid_json_http_${response.status}`);
  }
}

async function read_cache_status(
  port: number,
  signal: AbortSignal,
): Promise<docket_cache_status_row[]> {
  // The HTTP status surface remains the canonical configured-jurisdiction list.
  // Its historical bulk PostgREST row lookup can under-report cached rows, so
  // the automatic recovery worker reconciles actual cache membership/fetched_at
  // from the same production Postgres database before selecting work. Freshness
  // uses the same existing eight-hour policy declared in server/routes/docket.ts.
  const response = await fetch(`http://127.0.0.1:${port}/api/docket/cache-status`, {
    method: "GET",
    headers: {
      accept: "application/json",
      "x-request-id": "docket-state-cache-warmer-status",
    },
    signal,
  });
  const payload = await parse_json_response(response, "docket_state_cache_status");
  if (!response.ok || payload.ok !== true || !Array.isArray(payload.states)) {
    const message = typeof payload.message === "string"
      ? payload.message
      : `docket_state_cache_status_http_${response.status}`;
    throw new Error(message);
  }

  const configured_states = payload.states
    .filter((row): row is Record<string, unknown> => Boolean(row) && typeof row === "object" && !Array.isArray(row))
    .map(row => String(row.state ?? "").trim().toUpperCase())
    .filter(state => /^[A-Z]{2}$/.test(state));

  const cache_rows = await query_with_diagnostics<docket_cache_database_row>(
    `select state, fetched_at
       from public.docket_bill_state_cache
      where state = any($1::text[])`,
    [configured_states],
    {
      label: "docket_state_cache_warmer_cache_rows",
      pool_acquire_timeout_ms: 1_000,
      query_timeout_ms: 5_000,
    },
  );
  const cache_by_state = new Map(
    cache_rows.rows.map(row => [String(row.state).toUpperCase(), normalized_fetched_at(row.fetched_at)]),
  );
  const now_ms = Date.now();

  return configured_states.map(state => {
    const has_cache = cache_by_state.has(state);
    const fetched_at = cache_by_state.get(state) ?? null;
    const fetched_ms = fetched_at ? new Date(fetched_at).getTime() : Number.NaN;
    return {
      state,
      has_cache,
      fetched_at,
      is_fresh: has_cache
        && Number.isFinite(fetched_ms)
        && now_ms - fetched_ms < STATE_CACHE_TTL_MS,
    };
  });
}

async function warm_state(
  port: number,
  state: string,
  signal: AbortSignal,
): Promise<Record<string, unknown>> {
  const response = await fetch(`http://127.0.0.1:${port}/api/docket/warm-state`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-request-id": `docket-state-cache-warmer-${state.toLowerCase()}`,
    },
    body: JSON.stringify({ state }),
    signal,
  });
  const payload = await parse_json_response(response, "docket_state_cache_warm_state");
  if (!response.ok || payload.ok !== true) {
    const message = typeof payload.error === "string"
      ? payload.error
      : typeof payload.message === "string"
        ? payload.message
        : `docket_state_cache_warm_state_http_${response.status}`;
    throw new Error(message);
  }
  return payload;
}

export async function run_docket_state_cache_warmer_cycle(port: number): Promise<void> {
  if (cycle_running || stopped) return;
  cycle_running = true;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const limit = batch_size();
  const started_at = Date.now();

  try {
    const cache_states = await read_cache_status(port, controller.signal);
    const candidates = sort_docket_warm_candidates(cache_states);
    const states_to_warm = candidates.slice(0, limit);
    const results: Array<{ state: string; ok: boolean; source?: string; error?: string }> = [];

    for (let index = 0; index < states_to_warm.length; index += 1) {
      const candidate = states_to_warm[index];
      try {
        const payload = await warm_state(port, candidate.state, controller.signal);
        results.push({
          state: candidate.state,
          ok: true,
          source: typeof payload.source === "string" ? payload.source : undefined,
        });
      } catch (error) {
        results.push({
          state: candidate.state,
          ok: false,
          error: safe_error(error),
        });
      }

      if (index < states_to_warm.length - 1) {
        await sleep(WARM_STATE_DELAY_MS);
      }
    }

    const successful_count = results.filter(result => result.ok).length;
    console.log("[DocketCacheWarmer] cycle_succeeded", {
      limit,
      status_source: "database_reconciled",
      state_cache_ttl_ms: STATE_CACHE_TTL_MS,
      selected_states: states_to_warm.map(row => row.state),
      missing_selected: states_to_warm.filter(row => !row.has_cache).length,
      stale_selected: states_to_warm.filter(row => row.has_cache).length,
      warmed_count: successful_count,
      failed_count: results.length - successful_count,
      remaining_count: Math.max(0, candidates.length - successful_count),
      duration_ms: Date.now() - started_at,
    });
  } catch (error) {
    console.error("[DocketCacheWarmer] cycle_failed", {
      limit,
      duration_ms: Date.now() - started_at,
      error: controller.signal.aborted
        ? `docket_state_cache_warmer_timeout_${REQUEST_TIMEOUT_MS}ms`
        : safe_error(error),
    });
  } finally {
    clearTimeout(timeout);
    cycle_running = false;
  }
}

export function start_docket_state_cache_warmer(port: number): void {
  if (interval_timer || initial_timer || !warmer_enabled()) {
    if (!warmer_enabled()) console.log("[DocketCacheWarmer] disabled");
    return;
  }

  stopped = false;
  const cadence_ms = interval_ms();
  const limit = batch_size();
  console.log("[DocketCacheWarmer] started", {
    interval_ms: cadence_ms,
    batch_size: limit,
    initial_delay_ms: INITIAL_DELAY_MS,
    per_state_delay_ms: WARM_STATE_DELAY_MS,
    state_cache_ttl_ms: STATE_CACHE_TTL_MS,
    recovery_order: "missing_then_oldest_stale",
  });

  initial_timer = setTimeout(() => {
    initial_timer = null;
    void run_docket_state_cache_warmer_cycle(port);
  }, INITIAL_DELAY_MS);
  initial_timer.unref?.();

  interval_timer = setInterval(() => {
    void run_docket_state_cache_warmer_cycle(port);
  }, cadence_ms);
  interval_timer.unref?.();
}

export function stop_docket_state_cache_warmer(): void {
  stopped = true;
  if (initial_timer) clearTimeout(initial_timer);
  if (interval_timer) clearInterval(interval_timer);
  initial_timer = null;
  interval_timer = null;
}
