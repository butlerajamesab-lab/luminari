const DEFAULT_INTERVAL_MS = 15 * 60 * 1000;
const MIN_INTERVAL_MS = 5 * 60 * 1000;
const MAX_INTERVAL_MS = 24 * 60 * 60 * 1000;
const DEFAULT_BATCH_SIZE = 5;
const MAX_BATCH_SIZE = 10;
const INITIAL_DELAY_MS = 30_000;
const REQUEST_TIMEOUT_MS = 180_000;

let interval_timer: NodeJS.Timeout | null = null;
let initial_timer: NodeJS.Timeout | null = null;
let cycle_running = false;
let stopped = false;

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

export async function run_docket_state_cache_warmer_cycle(port: number): Promise<void> {
  if (cycle_running || stopped) return;
  cycle_running = true;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const limit = batch_size();
  const started_at = Date.now();

  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/docket/warm-next-batch`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-request-id": "docket-state-cache-warmer",
      },
      body: JSON.stringify({ limit }),
      signal: controller.signal,
    });

    const body = await response.text();
    let payload: Record<string, unknown> = {};
    try {
      payload = body ? JSON.parse(body) as Record<string, unknown> : {};
    } catch {
      throw new Error(`docket_state_cache_warmer_invalid_json_http_${response.status}`);
    }

    if (!response.ok || payload.ok !== true) {
      const message = typeof payload.error === "string"
        ? payload.error
        : typeof payload.message === "string"
          ? payload.message
          : `docket_state_cache_warmer_http_${response.status}`;
      throw new Error(message);
    }

    console.log("[DocketCacheWarmer] cycle_succeeded", {
      limit,
      warmed_count: Number(payload.warmed_count ?? 0),
      remaining_count: Number(payload.remaining_count ?? 0),
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
