import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const read_server_file = (path: string) => readFileSync(join(process.cwd(), "server", path), "utf8");

const db_facade = read_server_file("db.ts");
const queue_guard = read_server_file("queue-db-diagnostics.ts");
const legislative_worker = read_server_file("civic-genome-legislative-version-queue-worker.ts");
const prism_worker = read_server_file("services/prism-rosetta-queue-worker.ts");

describe("queue database starvation guard", () => {
  it("routes queue diagnostics through a PostgreSQL-side timeout and circuit breaker", () => {
    expect(db_facade).toContain('export { query_with_diagnostics } from "./queue-db-diagnostics"');
    expect(queue_guard).toContain("set_config('statement_timeout', $1, true)");
    expect(queue_guard).toContain('client.query({ text: "rollback", query_timeout: 2_000 })');
    expect(queue_guard).toContain("QUEUE_BACKOFF_MS = [10_000, 30_000, 60_000, 120_000, 300_000]");
    expect(queue_guard).toContain("queue_query_circuit_opened");
  });

  it("keeps legislative completion reconciliation bounded, lock-safe, and slower than claims", () => {
    expect(legislative_worker).toContain("const RECONCILE_BATCH_SIZE = 100");
    expect(legislative_worker).toContain("const DEFAULT_RECONCILE_INTERVAL_MS = 60_000");
    expect(legislative_worker).toContain("LEGISLATIVE_VERSION_QUEUE_RECONCILE_MS");
    expect(legislative_worker).toContain("reconcile_completed_jobs_if_due");
    expect(legislative_worker).toContain("for update of queue skip locked");
    expect(legislative_worker).toContain("limit $1::integer");
    expect(legislative_worker).toContain("[RECONCILE_BATCH_SIZE]");
  });

  it("keeps Prism completion reconciliation bounded, lock-safe, and slower than claims", () => {
    expect(prism_worker).toContain("const RECONCILE_BATCH_SIZE = 100");
    expect(prism_worker).toContain("const DEFAULT_RECONCILE_INTERVAL_MS = 60_000");
    expect(prism_worker).toContain("PRISM_ROSETTA_QUEUE_RECONCILE_MS");
    expect(prism_worker).toContain("reconcile_completed_jobs_if_due");
    expect(prism_worker).toContain("for update of queue skip locked");
    expect(prism_worker).toContain("limit $1::integer");
    expect(prism_worker).toContain("[RECONCILE_BATCH_SIZE]");
  });
});
