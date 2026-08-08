import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const batch = readFileSync(resolve(here, "provenance-batch-runtime-compat.ts"), "utf8");
const facade = readFileSync(resolve(here, "db.ts"), "utf8");
const alerting = readFileSync(resolve(here, "provenance-alerting.ts"), "utf8");
const migration = readFileSync(
  resolve(here, "../supabase/migrations/20260808200500_repair_provenance_batch_alert_runtime.sql"),
  "utf8",
);

describe("provenance batch and alert persistence contract", () => {
  it("normalizes the observed legacy batch schema without creating camelCase database columns", () => {
    expect(migration).toContain("rename column batch_rerun_runs_status_enum to status");
    expect(migration).toContain("add column if not exists completed_at bigint");
    expect(migration).toContain("add column if not exists aborted_at bigint");
    expect(migration).toContain("add column if not exists runtime_ms bigint");
    expect(migration).toContain("idx_batch_rerun_started_at");
    expect(migration).not.toContain('add column if not exists "completedAt"');
  });

  it("creates the alert table that the existing provenance alerting module already owns", () => {
    expect(alerting).toContain("provenanceAlertEvents");
    expect(migration).toContain("create table if not exists public.provenance_alert_events");
    expect(migration).toContain("PROVENANCE_DRIFT");
    expect(migration).toContain("PROVENANCE_COVERAGE_DROP");
    expect(migration).toContain("authenticated_read_provenance_alert_events");
    expect(migration).toContain("service_role_all_provenance_alert_events");
  });

  it("reads and writes the live snake_case batch contract while returning the established camelCase API shape", () => {
    expect(batch).toContain("started_by");
    expect(batch).toContain("total_findings");
    expect(batch).toContain("processed_count");
    expect(batch).toContain("fallback_usage_count");
    expect(batch).toContain("completed_at");
    expect(batch).toContain("runtimeMs:");
    expect(batch).toContain("startedBy:");
  });

  it("persists terminal batch states and stale-run expiry instead of fabricating UI completion", () => {
    expect(batch).toContain("status = 'completed'");
    expect(batch).toContain("status = 'aborted'");
    expect(batch).toContain("status = 'error'");
    expect(batch).toContain("greatest(total_findings - resolved_count - error_count, 0)");
    expect(batch).toContain("started_at <= $2");
  });

  it("routes all provenance batch helpers through the bounded compatibility facade", () => {
    expect(facade).toContain('from "./provenance-batch-runtime-compat"');
    for (const helper of [
      "createBatchRun",
      "getActiveBatchRun",
      "getBatchRunById",
      "updateBatchProgress",
      "completeBatchRun",
      "abortBatchRun",
      "getLatestBatchRun",
      "listBatchRuns",
      "expireStaleBatchRuns",
    ]) {
      expect(facade).toContain(helper);
    }
  });
});
