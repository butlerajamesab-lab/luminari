import { EventEmitter } from "node:events";
import { Pool } from "pg";
import { describe, expect, it } from "vitest";
import { create_receiver_bound_lazy_proxy } from "./lazy-receiver-bound-proxy";

class failing_client extends EventEmitter {
  connect(callback: (error?: Error) => void) {
    callback();
  }

  query(_text: unknown, values: unknown, callback?: (error?: Error) => void) {
    const done = typeof values === "function" ? values : callback;
    queueMicrotask(() => done?.(new Error("forced query failure")));
  }

  end(callback?: () => void) {
    callback?.();
  }
}

class succeeding_client extends EventEmitter {
  _queryable = true;
  _ending = false;

  connect(callback: (error?: Error) => void) {
    callback();
  }

  query(_text: unknown, values: unknown, callback?: (error?: Error, result?: unknown) => void) {
    const done = typeof values === "function" ? values : callback;
    queueMicrotask(() => done?.(undefined, { rows: [], rowCount: 0 }));
  }

  end(callback?: () => void) {
    this._ending = true;
    callback?.();
  }
}

describe("receiver-bound lazy proxy", () => {
  it("lets pg-pool remove every client after a query error", async () => {
    const actual_pool = new Pool({
      Client: failing_client as any,
      max: 3,
    } as any);
    const lazy_pool = create_receiver_bound_lazy_proxy(() => actual_pool);

    for (let attempt = 0; attempt < 3; attempt += 1) {
      await expect(lazy_pool.query("select forced_failure")).rejects.toThrow("forced query failure");
      expect(actual_pool.totalCount).toBe(0);
      expect(actual_pool.idleCount).toBe(0);
    }

    await actual_pool.end();
  });

  it("keeps counters, events, direct connect, and idle eviction on the real pool", async () => {
    const actual_pool = new Pool({
      Client: succeeding_client as any,
      max: 1,
      idleTimeoutMillis: 5,
    } as any);
    const lazy_pool = create_receiver_bound_lazy_proxy(() => actual_pool);
    let connect_events = 0;
    lazy_pool.on("connect", () => {
      connect_events += 1;
    });

    await lazy_pool.query("select success");
    expect(connect_events).toBe(1);
    expect(lazy_pool.totalCount).toBe(1);
    expect(lazy_pool.idleCount).toBe(1);
    expect(lazy_pool.waitingCount).toBe(0);

    await new Promise(resolve => setTimeout(resolve, 40));
    expect(actual_pool.totalCount).toBe(0);
    expect(lazy_pool.totalCount).toBe(0);
    expect(lazy_pool.idleCount).toBe(0);

    const client = await lazy_pool.connect();
    client.release();
    expect(lazy_pool.idleCount).toBe(1);
    await lazy_pool.end();
  });
});
