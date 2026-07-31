import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

function read(relative_path: string): string {
  return readFileSync(fileURLToPath(new URL(relative_path, import.meta.url)), "utf8");
}

const db_source = read("./db.ts");
const pool_source = read("./pg-config.ts");
const mission_control_source = read("./routers/admin-dashboard.ts");
const health_source = read("./_core/health-diagnostics.ts");
const canonical_shell = read("../client/src/pages/MissionControlShell.tsx");

describe("shared PostgreSQL pool safety contract", () => {
  it("does not race a session SET against the first transaction-pooler query", () => {
    expect(pool_source).not.toContain('pool.on("connect"');
    expect(pool_source).not.toContain("SET statement_timeout");
    expect(pool_source).toContain("query_timeout");
  });

  it("destroys a client after a client-side query timeout", () => {
    expect(db_source).toContain("let release_error: Error | boolean | undefined");
    expect(db_source).toContain("release_error = error instanceof Error ? error : true");
    expect(db_source).toContain("client.release(release_error as any)");
  });

  it("keeps Mission Control complete while bounding its internal database fan-out", () => {
    expect(canonical_shell).toContain('from "./MissionControl"');
    expect(mission_control_source).not.toContain("await Promise.all([");
  });

  it("keeps deep schema diagnostics to one database lease at a time", () => {
    const deep_snapshot = health_source.slice(
      health_source.indexOf("async function buildDeepSnapshot"),
      health_source.indexOf("async function getDeepSnapshot"),
    );
    expect(deep_snapshot).not.toContain("Promise.all");
    expect(deep_snapshot).toContain("const routes_promise = discoverRouteInventory()");
  });
});
