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
const lease_guard_source = read("./database-pool-lease-guard.ts");
const ingestion_control_source = read("./engines/ingestion_control.ts");
const civic_genome_page = read("../client/src/pages/CivicGenome.tsx");
const client_runtime = read("../client/src/main.tsx");
const lazy_proxy_source = read("./lazy-receiver-bound-proxy.ts");
const core_pool_source = read("./core/pg-pool.ts");
const internal_core_pool_source = read("./_core/pg-pool.ts");

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

  it("forces out a leaked client after a bounded wall-clock lease", () => {
    expect(pool_source).toContain("install_database_pool_lease_guard");
    expect(lease_guard_source).toContain("database_client_lease_timeout");
    expect(lease_guard_source).toContain("raw_release(error)");
  });

  it("preserves the real Pool receiver through the lazy export", () => {
    expect(db_source).toContain("create_receiver_bound_lazy_proxy(() => initializePool())");
    expect(lazy_proxy_source).toContain("value.bind(instance)");
    expect(lazy_proxy_source).toContain("Reflect.set(instance, property, value, instance)");
    expect(core_pool_source).toContain('export { pool } from "../db"');
    expect(internal_core_pool_source).toContain('export { pool } from "../db"');
    expect(core_pool_source).not.toContain("new Proxy");
    expect(internal_core_pool_source).not.toContain("new Proxy");
  });

  it("runs registry promotion policy gates before checking out a client", () => {
    const function_source = ingestion_control_source.slice(
      ingestion_control_source.indexOf("export async function promote_registry_entity_candidates_apply"),
      ingestion_control_source.indexOf("export async function set_corpus_import_queue_target_hint"),
    );
    expect(function_source.indexOf("canonical_promotion_feature_flag_disabled")).toBeLessThan(function_source.indexOf("await pool.connect()"));
  });

  it("does not retry Civic Genome saturation and bounds the client transport", () => {
    expect(civic_genome_page).toContain("stable_read_options = { retry: false");
    expect(client_runtime).toContain("is_non_retryable_runtime_error");
    expect(client_runtime).toContain("Lighthouse request timed out after 12000ms");
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
