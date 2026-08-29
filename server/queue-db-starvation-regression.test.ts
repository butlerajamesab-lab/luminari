import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

const diagnostics = read("server/queue-db-diagnostics.ts");
const legislative = read("server/civic-genome-legislative-version-queue-worker.ts");
const prism = read("server/services/prism-rosetta-queue-worker.ts");
const warmer = read("server/docket-state-cache-warmer.ts");
const startup = read("server/_core/index.ts");
const db_facade = read("server/db.ts");

describe("minimum Lighthouse queue stabilization", () => {
  it("cancels queue SQL inside PostgreSQL before the client timeout", () => {
    expect(db_facade).toContain('export { query_with_diagnostics } from "./queue-db-diagnostics"');
    expect(diagnostics).toContain("set_config('statement_timeout'");
    expect(diagnostics).toContain("server_statement_timeout_ms");
    expect(diagnostics).toContain('client.query({ text: "rollback", query_timeout: 2_000 })');
  });

  it("backs off claim/reconcile pressure including pool acquisition timeouts", () => {
    expect(diagnostics).toContain('label.endsWith("_claim")');
    expect(diagnostics).toContain('label.endsWith("_reconcile_completed")');
    expect(diagnostics).toContain('classify_db_error(error) === "pool_acquire_timeout"');
    expect(diagnostics).toContain('record_timeout(label, "pool_acquire_timeout")');
    expect(diagnostics).toContain("QUEUE_BACKOFF_MS = [10_000, 30_000, 60_000, 120_000, 300_000]");
  });

  it("does not circuit-break completion/failure ledger writes", () => {
    expect(diagnostics).toContain("Circuit breaking is intentionally limited to cycle-level claim/reconcile work");
    expect(diagnostics).not.toContain('label.endsWith("_complete")');
    expect(diagnostics).not.toContain('label.endsWith("_fail")');
  });

  it("bounds legislative completion reconciliation and preserves successful assemblies", () => {
    expect(legislative).toContain("const RECONCILE_BATCH_SIZE = 100");
    expect(legislative).toContain("for update of queue skip locked");
    expect(legislative).toContain("reconcile_completed_jobs_if_due");
    expect(legislative).toContain("[LegislativeVersionQueue] completion_deferred");
    const completion_start = legislative.indexOf("await mark_job_completed({");
    const next_cycle_start = legislative.indexOf(
      "export async function run_legislative_version_queue_cycle",
      completion_start,
    );
    const completion_path = legislative.slice(completion_start, next_cycle_start);
    expect(completion_start).toBeGreaterThan(-1);
    expect(completion_path).toContain("[LegislativeVersionQueue] completion_deferred");
    expect(completion_path).not.toContain("mark_job_failed");
  });

  it("bounds Prism reconciliation and preserves already-produced receipts", () => {
    expect(prism).toContain("const RECONCILE_BATCH_SIZE = 100");
    expect(prism).toContain("for update of queue skip locked");
    expect(prism).toContain("reconcile_completed_jobs_if_due");
    expect(prism).toContain("[PrismRosettaQueue] completion_deferred");
    expect(prism).toContain("bookkeeping, not evidence that");
  });

  it("warms Docket sequentially in bounded non-overlapping batches after HTTP startup", () => {
    expect(warmer).toContain("const DEFAULT_BATCH_SIZE = 5");
    expect(warmer).toContain("const MAX_BATCH_SIZE = 10");
    expect(warmer).toContain("const DEFAULT_INTERVAL_MS = 15 * 60 * 1000");
    expect(warmer).toContain("if (cycle_running || stopped) return");
    expect(warmer).toContain("/api/docket/warm-state");
    expect(warmer).toContain("for (let index = 0; index < states_to_warm.length; index += 1)");
    expect(warmer).toContain("await sleep(WARM_STATE_DELAY_MS)");
    const listen_index = startup.indexOf("server.listen(port, () => {");
    const warmer_index = startup.indexOf("start_docket_state_cache_warmer(port)");
    expect(listen_index).toBeGreaterThanOrEqual(0);
    expect(warmer_index).toBeGreaterThan(listen_index);
  });
});
