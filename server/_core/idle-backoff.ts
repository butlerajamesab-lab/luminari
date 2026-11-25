// Idle backoff for polling workers.
//
// A worker runs at its normal pace while it is finding work. Each cycle that
// finds nothing doubles the wait before the next check, up to a cap (default
// once a day). Finding work drops the worker straight back to its normal pace.
//
// Because every worker lives in the same process, any worker that does real
// work also nudges idle workers to take one look (at most once per activity
// window, default 15 minutes), so work handed downstream is not left waiting
// for the daily check. A nudged worker that still finds nothing goes back to
// its long wait at once.

const DEFAULT_IDLE_MAX_MS = 24 * 60 * 60 * 1000;
const MAX_IDLE_MAX_MS = 7 * 24 * 60 * 60 * 1000;
const DEFAULT_ACTIVITY_WAKE_MS = 15 * 60 * 1000;

export type idle_backoff = {
  readonly name: string;
  should_run(now_ms?: number): boolean;
  record(did_work: boolean, now_ms?: number): void;
  wake(): void;
  ms_until_due(now_ms?: number): number;
  snapshot(): idle_backoff_snapshot;
};

export type idle_backoff_snapshot = {
  name: string;
  base_ms: number;
  idle_streak: number;
  next_check_at: string | null;
};

type entry = {
  name: string;
  base_ms: number;
  idle_streak: number;
  next_due_ms: number;
};

const registry = new Map<string, entry>();
let last_activity_wake_ms = 0;

function env_ms(name: string, fallback: number, minimum: number, maximum: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(minimum, Math.min(maximum, Math.trunc(parsed)));
}

// Off switch: WORKER_IDLE_BACKOFF_ENABLED=false restores fixed-rhythm polling.
export function idle_backoff_enabled(): boolean {
  return process.env.WORKER_IDLE_BACKOFF_ENABLED?.trim().toLowerCase() !== "false";
}

export function idle_max_ms(): number {
  return env_ms("WORKER_IDLE_MAX_MS", DEFAULT_IDLE_MAX_MS, 1_000, MAX_IDLE_MAX_MS);
}

export function activity_wake_ms(): number {
  // 0 turns activity nudges off.
  return env_ms("WORKER_IDLE_ACTIVITY_WAKE_MS", DEFAULT_ACTIVITY_WAKE_MS, 0, MAX_IDLE_MAX_MS);
}

export function idle_delay_ms(base_ms: number, idle_streak: number, max_ms = idle_max_ms()): number {
  if (idle_streak <= 0) return 0;
  const base = Math.max(1, base_ms);
  const exponent = Math.min(idle_streak, 40);
  return Math.min(max_ms, base * 2 ** exponent);
}

function nudge_idle_workers(source: string, now_ms: number): void {
  const window_ms = activity_wake_ms();
  if (window_ms <= 0 || now_ms - last_activity_wake_ms < window_ms) return;
  last_activity_wake_ms = now_ms;
  for (const other of registry.values()) {
    if (other.name === source || other.next_due_ms <= now_ms) continue;
    other.next_due_ms = now_ms;
  }
}

export function create_idle_backoff(name: string, base_ms: number): idle_backoff {
  const state: entry = { name, base_ms: Math.max(1, base_ms), idle_streak: 0, next_due_ms: 0 };
  registry.set(name, state);

  return {
    name,
    should_run(now_ms = Date.now()) {
      if (!idle_backoff_enabled()) return true;
      return now_ms >= state.next_due_ms;
    },
    record(did_work, now_ms = Date.now()) {
      if (did_work) {
        if (state.idle_streak > 0) {
          console.log("[IdleBackoff] resumed", { worker: name, idle_streak: state.idle_streak });
        }
        state.idle_streak = 0;
        state.next_due_ms = 0;
        nudge_idle_workers(name, now_ms);
        return;
      }
      const max_ms = idle_max_ms();
      const previous_delay = idle_delay_ms(state.base_ms, state.idle_streak, max_ms);
      state.idle_streak += 1;
      const delay = idle_delay_ms(state.base_ms, state.idle_streak, max_ms);
      state.next_due_ms = now_ms + delay;
      if (state.idle_streak === 1 || (delay === max_ms && previous_delay < max_ms)) {
        console.log("[IdleBackoff] idle", {
          worker: name,
          idle_streak: state.idle_streak,
          next_check_in_ms: delay,
          at_cap: delay === max_ms,
        });
      }
    },
    wake() {
      state.idle_streak = 0;
      state.next_due_ms = 0;
    },
    ms_until_due(now_ms = Date.now()) {
      return Math.max(0, state.next_due_ms - now_ms);
    },
    snapshot() {
      return {
        name,
        base_ms: state.base_ms,
        idle_streak: state.idle_streak,
        next_check_at: state.next_due_ms > 0 ? new Date(state.next_due_ms).toISOString() : null,
      };
    },
  };
}

export function wake_idle_worker(name: string): void {
  const state = registry.get(name);
  if (!state) return;
  state.idle_streak = 0;
  state.next_due_ms = 0;
}

export function idle_backoff_snapshots(): idle_backoff_snapshot[] {
  return [...registry.values()].map(state => ({
    name: state.name,
    base_ms: state.base_ms,
    idle_streak: state.idle_streak,
    next_check_at: state.next_due_ms > 0 ? new Date(state.next_due_ms).toISOString() : null,
  }));
}

export function reset_idle_backoff_registry_for_tests(): void {
  registry.clear();
  last_activity_wake_ms = 0;
}
