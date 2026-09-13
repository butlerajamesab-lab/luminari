import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { query_with_diagnostics } from "../db";
import { activate_prism_for_rosetta_assembly } from "./prism-rosetta-activation";

vi.mock("../db", () => ({ query_with_diagnostics: vi.fn() }));
vi.mock("../runtime-role", () => ({ background_feature_enabled: () => true }));
vi.mock("./prism-rosetta-activation", () => ({
  activate_prism_for_rosetta_assembly: vi.fn(),
  PrismRosettaPartialActivationError: class extends Error {},
}));
vi.mock("./prism-rosetta-client", () => ({
  get_prism_rosetta_circuit_snapshot: () => ({ state: "closed", consecutive_failures: 0 }),
  prism_rosetta_circuit_allows_request: () => true,
  prism_rosetta_circuit_cooldown_ms: () => 900_000,
  prism_rosetta_circuit_failure_threshold: () => 1,
  prism_rosetta_request_timeout_ms: () => 15_000,
}));

const oldQueueId = "00000000-0000-4000-8000-000000000024";
const newQueueId = "00000000-0000-4000-8000-000000000025";

describe("Prism 2.5 replenishment through the actual worker", () => {
  let stopWorker: (() => Promise<void>) | undefined;

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-13T00:00:00Z"));
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubEnv("PRISM_ROSETTA_QUEUE_CANARY_ID", "");
    vi.stubEnv("PRISM_ROSETTA_QUEUE_BATCH_IDS", "");
    vi.stubEnv("PRISM_ROSETTA_QUEUE_MAX_NEW_SUBMISSIONS", "1");
    vi.stubEnv("PRISM_ROSETTA_QUEUE_POLL_MS", "10000");
    vi.stubEnv("PRISM_ROSETTA_QUEUE_RECONCILE_MS", "60000");
    vi.mocked(activate_prism_for_rosetta_assembly).mockRejectedValue(new Error("unexpected_activation"));
  });

  afterEach(async () => {
    await stopWorker?.();
    stopWorker = undefined;
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });

  it.each(["canary", "batch"])("an exhausted historical %s selection cannot replenish or admit 2.5 work", async (mode) => {
    vi.stubEnv(mode === "canary" ? "PRISM_ROSETTA_QUEUE_CANARY_ID" : "PRISM_ROSETTA_QUEUE_BATCH_IDS", oldQueueId);
    const rows = [
      { queue_id: oldQueueId, prism_rule_set_version: "2.4.0", queue_state: "completed" },
      { queue_id: newQueueId, prism_rule_set_version: "2.5.0", queue_state: "eligible" },
    ];
    const before = structuredClone(rows);
    vi.mocked(query_with_diagnostics).mockImplementation(async (_sql, params, options) => {
      if (options.label === "prism_rosetta_queue_reconcile_completed") {
        expect(params[1]).toEqual(mode === "canary" ? oldQueueId : null);
        expect(params[2]).toEqual(mode === "batch" ? [oldQueueId] : null);
        return { rows: [] } as never;
      }
      if (options.label === "prism_rosetta_queue_claim") {
        expect(params[2]).toBe("2.5.0");
        const candidates = rows.filter((row) => row.prism_rule_set_version === params[2]
          && row.queue_state === "eligible"
          && (!params[4] || row.queue_id === params[4])
          && (!params[5] || (params[5] as string[]).includes(row.queue_id)));
        expect(candidates).toHaveLength(0);
        return { rows: candidates } as never;
      }
      throw new Error(`unexpected database operation: ${options.label}`);
    });
    const worker = await import("./prism-rosetta-queue-worker");
    stopWorker = worker.stop_prism_rosetta_queue_worker;
    worker.start_prism_rosetta_queue_worker();
    await vi.advanceTimersByTimeAsync(125_000);

    const labels = vi.mocked(query_with_diagnostics).mock.calls.map((call) => call[2].label);
    expect(labels.filter((label) => label === "prism_rosetta_queue_reconcile_completed")).toHaveLength(3);
    expect(labels).toContain("prism_rosetta_queue_claim");
    expect(labels.some((label) => label?.includes("replenish"))).toBe(false);
    expect(activate_prism_for_rosetta_assembly).not.toHaveBeenCalled();
    expect(console.error).not.toHaveBeenCalled();
    expect(rows).toEqual(before);
  });

  it("dispatches unscoped bounded replenishment to 2.5 and retains its 100-row limit", async () => {
    vi.mocked(query_with_diagnostics).mockImplementation(async (sql, params, options) => {
      if (options.label === "prism_rosetta_queue_replenish_v25") {
        expect(sql).toBe("select public.enqueue_civic_genome_prism_v25_batch_v1($1::integer)");
        expect(params).toEqual([100]);
      } else {
        expect(["prism_rosetta_queue_reconcile_completed", "prism_rosetta_queue_claim"]).toContain(options.label);
      }
      return { rows: [] } as never;
    });
    const worker = await import("./prism-rosetta-queue-worker");
    stopWorker = worker.stop_prism_rosetta_queue_worker;
    worker.start_prism_rosetta_queue_worker();
    await vi.advanceTimersByTimeAsync(65_000);

    const calls = vi.mocked(query_with_diagnostics).mock.calls;
    expect(calls.filter((call) => call[2].label === "prism_rosetta_queue_replenish_v25")).toHaveLength(2);
    expect(calls.some((call) => call[0].includes("enqueue_civic_genome_prism_v24_batch_v1"))).toBe(false);
    expect(activate_prism_for_rosetta_assembly).not.toHaveBeenCalled();
    expect(console.error).not.toHaveBeenCalled();
  });
});
