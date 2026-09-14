import { query_with_diagnostics } from "./db";
import { background_feature_enabled } from "./runtime-role";

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
let active_cycle: Promise<void> | null = null;
let active_controller: AbortController | null = null;
let stopped = false;

type docket_cache_status_row = {
  state: string;
  has_cache: boolean;
  fetched_at: string | null;
  is_fresh: boolean;
  requires_retry?: boolean;
  retry_scheduled?: boolean;
};

type docket_cache_database_row = {
  state: string;
  has_cache: boolean;
  fetched_at: string | Date | null;
  retry_after: string | Date | null;
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
  return background_feature_enabled("DOCKET_STATE_CACHE_WARMER_ENABLED");
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
 * Fresh jurisdictions are selected only when their prior warm/projection
 * attempt failed and therefore requires an explicit retry.
 */
export function sort_docket_warm_candidates(
  states: docket_cache_status_row[],
): docket_cache_status_row[] {
  return states
    .filter(row => row.requires_retry === true || (row.is_fresh !== true && row.retry_scheduled !== true))
    .sort((a, b) => {
      if (a.requires_retry !== b.requires_retry) return a.requires_retry ? -1 : 1;
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

export function select_docket_warm_batch(
  candidates: docket_cache_status_row[],
  limit: number,
): docket_cache_status_row[] {
  const retries = candidates.filter(row => row.requires_retry === true);
  const ordinary = candidates.filter(row => row.requires_retry !== true);
  if (limit <= 1 && ordinary.length > 0) return ordinary.slice(0, 1);
  const retry_capacity = ordinary.length > 0 ? Math.max(1, Math.floor(limit / 2)) : limit;
  const selected_retries = retries.slice(0, retry_capacity);
  const selected_ordinary = ordinary.slice(0, limit - selected_retries.length);
  const remaining = limit - selected_retries.length - selected_ordinary.length;
  return remaining > 0
    ? [...selected_retries, ...selected_ordinary, ...retries.slice(selected_retries.length, selected_retries.length + remaining)]
    : [...selected_retries, ...selected_ordinary];
}

async function record_retry(state: string, error: unknown): Promise<void> {
  await query_with_diagnostics(
    `insert into public.docket_state_projection_retry
       (state, failure_count, retry_after, last_error_code, updated_at)
     values ($1, 1, now() + interval '15 minutes', $2, now())
     on conflict (state) do update set
       failure_count = least(public.docket_state_projection_retry.failure_count + 1, 1000),
       retry_after = now() + interval '15 minutes',
       last_error_code = excluded.last_error_code,
       updated_at = now()`,
    [state, safe_error(error)],
    { label: "docket_state_projection_retry_record", pool_acquire_timeout_ms: 1_000, query_timeout_ms: 5_000 },
  );
}

async function clear_retry(state: string): Promise<void> {
  await query_with_diagnostics(
    `delete from public.docket_state_projection_retry where state = $1`,
    [state],
    { label: "docket_state_projection_retry_clear", pool_acquire_timeout_ms: 1_000, query_timeout_ms: 5_000 },
  );
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
    `with configured(state) as (select unnest($1::text[]))
     select configured.state, cache.state is not null as has_cache,
            cache.fetched_at, retry.retry_after
       from configured
       left join public.docket_bill_state_cache cache on cache.state = configured.state
       left join public.docket_state_projection_retry retry on retry.state = configured.state`,
    [configured_states],
    {
      label: "docket_state_cache_warmer_cache_rows",
      pool_acquire_timeout_ms: 1_000,
      query_timeout_ms: 5_000,
    },
  );
  const cache_by_state = new Map(
    cache_rows.rows.map(row => [String(row.state).toUpperCase(), {
      has_cache: row.has_cache === true,
      fetched_at: normalized_fetched_at(row.fetched_at),
      retry_after: normalized_fetched_at(row.retry_after),
    }]),
  );
  const now_ms = Date.now();

  return configured_states.map(state => {
    const cache_state = cache_by_state.get(state);
    const has_cache = cache_state?.has_cache === true;
    const fetched_at = cache_state?.fetched_at ?? null;
    const fetched_ms = fetched_at ? new Date(fetched_at).getTime() : Number.NaN;
    return {
      state,
      has_cache,
      fetched_at,
      is_fresh: has_cache
        && Number.isFinite(fetched_ms)
        && now_ms - fetched_ms < STATE_CACHE_TTL_MS,
      requires_retry: Boolean(cache_state?.retry_after && new Date(cache_state.retry_after).getTime() <= now_ms),
      retry_scheduled: Boolean(cache_state?.retry_after),
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

export function run_docket_state_cache_warmer_cycle(port: number): Promise<void> {
  if (active_cycle) return active_cycle;
  if (stopped) return Promise.resolve();

  const controller = new AbortController();
  active_controller = controller;
  const cycle = (async () => {
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    const limit = batch_size();
    const started_at = Date.now();
    try {
    const cache_states = await read_cache_status(port, controller.signal);
    const candidates = sort_docket_warm_candidates(cache_states);
    const states_to_warm = select_docket_warm_batch(candidates, limit);
    const results: Array<{ state: string; ok: boolean; source?: string; error?: string }> = [];

    for (let index = 0; index < states_to_warm.length; index += 1) {
      const candidate = states_to_warm[index];
      try {
        await record_retry(candidate.state, new Error("projection_attempt_in_progress"));
        const payload = await warm_state(port, candidate.state, controller.signal);
        results.push({
          state: candidate.state,
          ok: true,
          source: typeof payload.source === "string" ? payload.source : undefined,
        });
        await clear_retry(candidate.state);
      } catch (error) {
        try {
          await record_retry(candidate.state, error);
        } catch (retry_error) {
          console.error("[DocketCacheWarmer] retry_record_failed", {
            state: candidate.state,
            error: safe_error(retry_error),
          });
        }
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
    }
  })();
  active_cycle = cycle;
  void cycle.finally(() => {
    if (active_cycle === cycle) active_cycle = null;
    if (active_controller === controller) active_controller = null;
  });
  return cycle;
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

export async function stop_docket_state_cache_warmer(): Promise<void> {
  stopped = true;
  if (initial_timer) clearTimeout(initial_timer);
  if (interval_timer) clearInterval(interval_timer);
  initial_timer = null;
  interval_timer = null;
  active_controller?.abort();
  await active_cycle;
}
