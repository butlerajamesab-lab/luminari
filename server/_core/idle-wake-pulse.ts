import { query_with_diagnostics } from "../db";
import { poke_workers_watching, watched_tables } from "./idle-backoff";

// Reads Postgres's own per-table write counters (inserts + updates + deletes)
// for the tables idle workers watch. No table is scanned: about 1 ms per pulse.
// A counter that moved means another writer (this process, the web service, a
// trigger) touched that table, so the workers watching it take one look.

const DEFAULT_PULSE_MS = 60_000;
const MIN_PULSE_MS = 5_000;
const MAX_PULSE_MS = 60 * 60 * 1000;

const COUNTERS_SQL = `select t as table_name,
       coalesce(pg_stat_get_tuples_inserted(to_regclass(t)), 0)
     + coalesce(pg_stat_get_tuples_updated(to_regclass(t)), 0)
     + coalesce(pg_stat_get_tuples_deleted(to_regclass(t)), 0) as writes
  from unnest($1::text[]) t`;

export function wake_pulse_ms(): number {
  const parsed = Number(process.env.WORKER_WAKE_PULSE_MS);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_PULSE_MS;
  return Math.max(MIN_PULSE_MS, Math.min(MAX_PULSE_MS, Math.trunc(parsed)));
}

export function changed_tables(
  previous: Map<string, string>,
  current: Array<{ table_name: string; writes: string | number }>,
): string[] {
  const changed: string[] = [];
  for (const row of current) {
    const writes = String(row.writes);
    const before = previous.get(row.table_name);
    if (before !== undefined && before !== writes) changed.push(row.table_name);
    previous.set(row.table_name, writes);
  }
  return changed;
}

let timer: NodeJS.Timeout | null = null;
let running = false;
const last_seen = new Map<string, string>();

export async function run_wake_pulse_once(): Promise<string[]> {
  const tables = watched_tables();
  if (tables.length === 0) return [];
  const { rows } = await query_with_diagnostics<{ table_name: string; writes: string }>(
    COUNTERS_SQL,
    [tables],
    { label: "worker_wake_pulse", pool_acquire_timeout_ms: 1_000, query_timeout_ms: 5_000 },
  );
  const changed = changed_tables(last_seen, rows);
  if (changed.length === 0) return [];
  const poked = poke_workers_watching(changed);
  if (poked.length > 0) console.log("[WakePulse] poked", { tables: changed, workers: poked });
  return poked;
}

export function start_wake_pulse(): void {
  if (timer) return;
  if (process.env.WORKER_IDLE_BACKOFF_ENABLED?.trim().toLowerCase() === "false") return;
  const interval_ms = wake_pulse_ms();
  console.log("[WakePulse] started", { interval_ms, tables: watched_tables().length });
  const tick = () => {
    if (running) return;
    running = true;
    run_wake_pulse_once()
      .catch(error => console.error("[WakePulse] failed", {
        error_code: error instanceof Error ? error.message.slice(0, 160) : "unknown",
      }))
      .finally(() => { running = false; });
  };
  tick();
  timer = setInterval(tick, interval_ms);
  timer.unref?.();
}

export function stop_wake_pulse(): void {
  if (timer) clearInterval(timer);
  timer = null;
}

export function reset_wake_pulse_for_tests(): void {
  stop_wake_pulse();
  last_seen.clear();
  running = false;
}
