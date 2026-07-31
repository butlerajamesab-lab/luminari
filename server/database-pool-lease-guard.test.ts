import { EventEmitter } from "node:events";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  get_database_pool_lease_guard_snapshot,
  install_database_pool_lease_guard,
} from "./database-pool-lease-guard";

class FakePool extends EventEmitter {
  totalCount = 1;
  idleCount = 0;
  waitingCount = 0;
  raw_release = vi.fn();
  client = Object.assign(new EventEmitter(), { release: this.raw_release, readyForQuery: true });

  connect(callback?: (...args: any[]) => void) {
    this.client.release = this.raw_release;
    if (callback) {
      callback(undefined, this.client, this.raw_release);
      return undefined;
    }
    return Promise.resolve(this.client);
  }
}

describe("database pool lease guard", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("forcibly removes a lease that outlives its wall-clock budget", async () => {
    vi.useFakeTimers();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const pool = new FakePool();
    install_database_pool_lease_guard(pool as any, { timeout_ms: 1_000, warn_ms: 500 });

    const client = await (pool as any).connect();
    expect(get_database_pool_lease_guard_snapshot(pool as any).active_lease_count).toBe(1);

    await vi.advanceTimersByTimeAsync(1_001);

    expect(pool.raw_release).toHaveBeenCalledTimes(1);
    expect(pool.raw_release.mock.calls[0][0]).toMatchObject({ code: "database_client_lease_timeout" });
    expect(get_database_pool_lease_guard_snapshot(pool as any)).toMatchObject({
      active_lease_count: 0,
      expired_lease_total: 1,
    });

    // A well-formed caller's delayed finally block must not double-release the
    // lease after the guard already forced it out of the pool.
    client.release();
    expect(pool.raw_release).toHaveBeenCalledTimes(1);
  });

  it("passes the guarded release callback to callback-style pool callers", async () => {
    const pool = new FakePool();
    install_database_pool_lease_guard(pool as any, { timeout_ms: 1_000 });

    await new Promise<void>((resolve, reject) => {
      (pool as any).connect((error: Error | undefined, client: any, done: () => void) => {
        if (error) return reject(error);
        expect(done).toBe(client.release);
        done();
        resolve();
      });
    });

    expect(pool.raw_release).toHaveBeenCalledTimes(1);
    expect(get_database_pool_lease_guard_snapshot(pool as any).active_lease_count).toBe(0);
  });

  it("forces out a checked-out client on a socket error", async () => {
    const pool = new FakePool();
    install_database_pool_lease_guard(pool as any, { timeout_ms: 1_000 });
    const client = await (pool as any).connect();
    const socket_error = new Error("socket closed");

    client.emit("error", socket_error);

    expect(pool.raw_release).toHaveBeenCalledTimes(1);
    expect(pool.raw_release).toHaveBeenCalledWith(socket_error);
    expect(get_database_pool_lease_guard_snapshot(pool as any).active_lease_count).toBe(0);
    client.release();
    expect(pool.raw_release).toHaveBeenCalledTimes(1);
  });
});
