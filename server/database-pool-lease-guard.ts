import type { Pool, PoolClient } from "pg";
import { get_database_request_context, type database_request_context } from "./db-request-context";

type release_argument = Error | boolean | undefined;

type guarded_lease = {
  acquired_at: number;
  context: database_request_context | null;
  acquisition_stack: string | null;
  expired: boolean;
  forced_release: boolean;
  timeout: ReturnType<typeof setTimeout>;
  error_listener: (error: Error) => void;
  release: (error?: release_argument) => void;
};

type lease_guard_state = {
  leases: Map<PoolClient, guarded_lease>;
  expired_total: number;
  timeout_ms: number;
  warn_ms: number;
};

export type database_pool_lease_guard_snapshot = {
  active_lease_count: number;
  expired_active_lease_count: number;
  expired_lease_total: number;
  oldest_active_lease_ms: number | null;
  lease_timeout_ms: number | null;
};

const guard_states = new WeakMap<Pool, lease_guard_state>();

/**
 * Trim an acquisition stack to the frames that name the owner: drop the
 * guard's own frames and node internals, keep the first frames in
 * application code.
 */
function capture_acquisition_stack(): string | null {
  const raw = new Error("pool_client_acquisition").stack;
  if (!raw) return null;
  const frames = raw.split("\n").slice(1)
    .filter(line => !line.includes("database-pool-lease-guard") && !line.includes("node:internal") && !line.includes("node_modules"))
    .slice(0, 12);
  return frames.length ? frames.join("\n") : null;
}

function lease_log_context(lease: guarded_lease) {
  return {
    request_method: lease.context?.method ?? null,
    request_path: lease.context?.path ?? null,
    request_id: lease.context?.request_id ?? null,
    job_label: lease.context?.label ?? null,
    job_id: lease.context?.job_id ?? null,
    acquired_at: new Date(lease.acquired_at).toISOString(),
    // When no HTTP or job context is present, the acquisition stack is the
    // only evidence that names the owner. Emit it on expiry so an unlabeled
    // background loop identifies itself.
    acquisition_stack: lease.context ? null : lease.acquisition_stack,
  };
}

/**
 * Put a wall-clock ceiling around every checked-out pg client.
 *
 * node-postgres bounds individual queries, but a manual transaction can retain
 * a client between queries or return before its finally block. The guard wraps
 * Pool.connect for both promise and callback callers (including Pool.query), so
 * an expired lease is returned to pg-pool with an error and removed normally.
 * A later finally release is absorbed only after a forced expiry; ordinary
 * double-release mistakes retain pg-pool's native throw behavior.
 */
export function install_database_pool_lease_guard(
  pool: Pool,
  options: { timeout_ms?: number; warn_ms?: number } = {},
): void {
  if (guard_states.has(pool)) return;

  const timeout_ms = options.timeout_ms ?? 60_000;
  const warn_ms = Math.min(options.warn_ms ?? 10_000, timeout_ms);
  const state: lease_guard_state = {
    leases: new Map(),
    expired_total: 0,
    timeout_ms,
    warn_ms,
  };
  guard_states.set(pool, state);

  const original_connect = pool.connect.bind(pool);

  const guard_client = (
    client: PoolClient,
    raw_release: (error?: release_argument) => void,
    context: database_request_context | null,
  ): ((error?: release_argument) => void) => {
    let released = false;
    const lease: guarded_lease = {
      acquired_at: Date.now(),
      context,
      // Only pay for a stack capture when the caller carries no context;
      // labeled HTTP requests and jobs already identify themselves.
      acquisition_stack: context ? null : capture_acquisition_stack(),
      expired: false,
      forced_release: false,
      timeout: undefined as unknown as ReturnType<typeof setTimeout>,
      error_listener: undefined as unknown as (error: Error) => void,
      release: undefined as unknown as (error?: release_argument) => void,
    };

    const guarded_release = (error?: release_argument) => {
      if (released) {
        // A forced deadline can race a well-formed caller's finally block.
        // Absorb only that cleanup call; preserve native double-release errors
        // for every ordinary lease.
        if (lease.forced_release) return;
        raw_release(error);
        return;
      }

      released = true;
      clearTimeout(lease.timeout);
      client.removeListener("error", lease.error_listener);
      state.leases.delete(client);
      const duration_ms = Date.now() - lease.acquired_at;
      if (!lease.expired && duration_ms >= state.warn_ms) {
        console.warn("[DB] pool_client_long_lease", {
          duration_ms,
          lease_timeout_ms: state.timeout_ms,
          active_lease_count: state.leases.size,
          ...lease_log_context(lease),
        });
      }
      let release_error = error;
      if (!release_error && (client as any).readyForQuery === false) {
        release_error = Object.assign(
          new Error("PostgreSQL client was released while a query was still active"),
          { code: "database_client_released_busy" },
        );
        console.error("[DB] pool_client_released_busy", {
          duration_ms,
          active_lease_count: state.leases.size,
          ...lease_log_context(lease),
        });
      }
      raw_release(release_error);
    };

    lease.release = guarded_release;
    lease.error_listener = (error: Error) => {
      if (released) return;
      lease.forced_release = true;
      guarded_release(error);
    };
    client.on("error", lease.error_listener);
    lease.timeout = setTimeout(() => {
      if (!state.leases.has(client)) return;
      lease.expired = true;
      lease.forced_release = true;
      state.expired_total += 1;
      const duration_ms = Date.now() - lease.acquired_at;
      const error = Object.assign(
        new Error(`PostgreSQL client lease exceeded ${state.timeout_ms}ms`),
        { code: "database_client_lease_timeout" },
      );
      console.error("[DB] pool_client_lease_expired", {
        duration_ms,
        lease_timeout_ms: state.timeout_ms,
        active_lease_count: state.leases.size,
        pool_total_count: pool.totalCount,
        pool_idle_count: pool.idleCount,
        pool_waiting_count: pool.waitingCount,
        ...lease_log_context(lease),
      });
      guarded_release(error);
    }, state.timeout_ms);
    lease.timeout.unref?.();
    state.leases.set(client, lease);
    client.release = guarded_release as PoolClient["release"];
    return guarded_release;
  };

  (pool as any).connect = (callback?: (...args: any[]) => void) => {
    const context = get_database_request_context();
    if (typeof callback === "function") {
      return (original_connect as any)((error: Error | undefined, client: PoolClient | undefined, done: ((error?: release_argument) => void) | undefined) => {
        if (error || !client) {
          callback(error, client, done);
          return;
        }
        const guarded_release = guard_client(client, done ?? client.release, context);
        callback(undefined, client, guarded_release);
      });
    }

    return (original_connect as () => Promise<PoolClient>)().then(client => {
      guard_client(client, client.release, context);
      return client;
    });
  };

  pool.on("remove", (client: PoolClient) => {
    const lease = state.leases.get(client);
    if (!lease) return;
    clearTimeout(lease.timeout);
    client.removeListener("error", lease.error_listener);
    state.leases.delete(client);
  });
}

export function get_database_pool_lease_guard_snapshot(
  pool: Pool | null,
): database_pool_lease_guard_snapshot {
  if (!pool) {
    return {
      active_lease_count: 0,
      expired_active_lease_count: 0,
      expired_lease_total: 0,
      oldest_active_lease_ms: null,
      lease_timeout_ms: null,
    };
  }

  const state = guard_states.get(pool);
  if (!state) {
    return {
      active_lease_count: Math.max(0, pool.totalCount - pool.idleCount),
      expired_active_lease_count: 0,
      expired_lease_total: 0,
      oldest_active_lease_ms: null,
      lease_timeout_ms: null,
    };
  }

  const now = Date.now();
  const leases = [...state.leases.values()];
  return {
    active_lease_count: leases.length,
    expired_active_lease_count: leases.filter(lease => lease.expired).length,
    expired_lease_total: state.expired_total,
    oldest_active_lease_ms: leases.length
      ? Math.max(...leases.map(lease => now - lease.acquired_at))
      : null,
    lease_timeout_ms: state.timeout_ms,
  };
}
