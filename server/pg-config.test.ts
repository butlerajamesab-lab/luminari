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
  },
}));

import { create_database_pool } from "./pg-config";

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
    expect(pool_state.event_names).toEqual(["error"]);
  });
});
