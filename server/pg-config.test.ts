import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const pool_state = vi.hoisted(() => ({
  configurations: [] as Array<Record<string, unknown>>,
  event_names: [] as string[],
}));

vi.mock("pg", () => ({
  Pool: class {
    options: Record<string, unknown>;

    constructor(options: Record<string, unknown>) {
      this.options = options;
      pool_state.configurations.push(options);
    }

    on(event_name: string) {
      pool_state.event_names.push(event_name);
      return this;
    }

    connect() {
      return Promise.reject(new Error("not used by this test"));
    }
  },
}));

import { create_database_pool, resolve_database_ssl } from "./pg-config";

const original_database_url = process.env.DATABASE_URL;

describe("canonical PostgreSQL pool configuration", () => {
  beforeEach(() => {
    pool_state.configurations.length = 0;
    pool_state.event_names.length = 0;
    process.env.DATABASE_URL = "postgresql://user:password@pooler.example.com:6543/postgres?sslmode=require";
  });

  afterEach(() => {
    if (original_database_url === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = original_database_url;
  });

  it("never disables SSL for production or for any remote test database", () => {
    const remote = "postgresql://user:password@pooler.example.com:6543/postgres";
    const loopback = "postgresql://postgres:postgres@localhost:5432/app";
    expect(resolve_database_ssl(remote, { NODE_ENV: "test" }))
      .toEqual({ rejectUnauthorized: false });
    expect(resolve_database_ssl(loopback, { NODE_ENV: "production" }))
      .toEqual({ rejectUnauthorized: false });
    expect(resolve_database_ssl("invalid-url", { NODE_ENV: "test" }))
      .toEqual({ rejectUnauthorized: false });
  });

  it("disables SSL only for explicit disposable local test PostgreSQL", () => {
    const local = "postgresql://postgres:postgres@127.0.0.1:5432/app";
    expect(resolve_database_ssl(local, { NODE_ENV: "test" })).toBe(false);
    expect(resolve_database_ssl("postgresql://postgres:postgres@localhost:5432/app",
      { NODE_ENV: "test" })).toBe(false);
  });

  it("uses a client-side timeout without a racing connect listener", () => {
    create_database_pool({
      label: "TEST",
      max: 25,
      query_timeout_millis: 8000,
      application_name: "luminari-render",
    });

    expect(pool_state.configurations[0]).toMatchObject({
      max: 25,
      query_timeout: 8000,
      application_name: "luminari-render",
    });
    expect(pool_state.event_names).toEqual(["error", "remove"]);
  });
});
