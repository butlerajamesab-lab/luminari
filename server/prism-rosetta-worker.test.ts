import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const boundaries = vi.hoisted(() => ({
  start_prism: vi.fn(),
  stop_prism: vi.fn(async () => undefined),
  start_legislative: vi.fn(),
  stop_legislative: vi.fn(async () => undefined),
  start_current_result_observer: vi.fn(),
  stop_current_result_observer: vi.fn(async () => undefined),
  start_final_source: vi.fn(),
  stop_final_source: vi.fn(),
  recovery_scope: vi.fn(() => null),
  bill_text: vi.fn(),
  pool_end: vi.fn(async () => undefined),
}));

vi.mock("dotenv/config", () => ({}));
vi.mock("./db", () => ({ getPool: () => ({ end: boundaries.pool_end }) }));
vi.mock("./services/prism-rosetta-queue-worker", () => ({
  start_prism_rosetta_queue_worker: boundaries.start_prism,
  stop_prism_rosetta_queue_worker: boundaries.stop_prism,
}));
vi.mock("./civic-genome-legislative-version-queue-worker", () => ({
  legislative_version_queue_recovery_contract_scope: boundaries.recovery_scope,
  start_current_result_observation_worker: boundaries.start_current_result_observer,
  start_legislative_version_queue_worker: boundaries.start_legislative,
  stop_current_result_observation_worker: boundaries.stop_current_result_observer,
  stop_legislative_version_queue_worker: boundaries.stop_legislative,
}));
vi.mock("./services/legiscan", () => ({ get_bill_text: boundaries.bill_text }));
vi.mock("./civic-genome-final-source-reconciliation-worker", () => ({
  start_civic_genome_final_source_reconciliation_worker: boundaries.start_final_source,
  stop_civic_genome_final_source_reconciliation_worker: boundaries.stop_final_source,
}));

const uuid = (value: number) => `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
let signals: Map<string | symbol, (...args: any[]) => void>;

describe("dedicated Prism worker entrypoint selection", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.useFakeTimers();
    signals = new Map();
    vi.spyOn(process, "once").mockImplementation((event, listener) => {
      signals.set(event, listener);
      return process;
    });
    vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.stubEnv("LIGHTHOUSE_RUNTIME_ROLE", "worker");
    vi.stubEnv("PRISM_ROSETTA_QUEUE_ENABLED", "true");
    vi.stubEnv("LEGISLATIVE_VERSION_QUEUE_ENABLED", "false");
    vi.stubEnv("LEGISLATIVE_VERSION_CURRENT_SOURCES_ENABLED", "false");
    vi.stubEnv("LEGISLATIVE_VERSION_QUEUE_RECOVERY_CONTRACT_SCOPE", "");
    vi.stubEnv("CIVIC_GENOME_FINAL_SOURCE_RECONCILIATION_ENABLED", "false");
    vi.stubEnv("PRISM_ROSETTA_QUEUE_CANARY_ID", "");
    vi.stubEnv("PRISM_ROSETTA_QUEUE_BATCH_IDS", "");
  });

  afterEach(async () => {
    signals.get("SIGTERM")?.();
    await vi.advanceTimersByTimeAsync(0);
    vi.clearAllTimers();
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });

  it.each(["batch", "canary"])("starts and shuts down the actual entrypoint with valid %s selection", async (selection) => {
    if (selection === "batch") {
      vi.stubEnv("PRISM_ROSETTA_QUEUE_BATCH_IDS", Array.from({ length: 25 }, (_, i) => uuid(i)).join(","));
    } else {
      vi.stubEnv("PRISM_ROSETTA_QUEUE_CANARY_ID", uuid(1));
    }
    await import("./prism-rosetta-worker");
    expect(boundaries.start_prism).toHaveBeenCalledTimes(1);
    expect(boundaries.start_current_result_observer).toHaveBeenCalledTimes(1);
    expect(boundaries.start_legislative).not.toHaveBeenCalled();
    expect(signals.has("SIGTERM")).toBe(true);
    expect(signals.has("SIGINT")).toBe(true);
    signals.get("SIGTERM")?.();
    await vi.advanceTimersByTimeAsync(0);
    expect(boundaries.stop_prism).toHaveBeenCalledTimes(1);
    expect(boundaries.stop_current_result_observer).toHaveBeenCalledTimes(1);
    expect(boundaries.pool_end).toHaveBeenCalledTimes(1);
  });

  it("starts final-source reconciliation independently when explicitly enabled", async () => {
    vi.stubEnv("PRISM_ROSETTA_QUEUE_CANARY_ID", uuid(1));
    vi.stubEnv("CIVIC_GENOME_FINAL_SOURCE_RECONCILIATION_ENABLED", "true");
    await import("./prism-rosetta-worker");
    await vi.advanceTimersByTimeAsync(0);
    expect(boundaries.start_final_source).toHaveBeenCalledTimes(1);
    signals.get("SIGTERM")?.();
    await vi.advanceTimersByTimeAsync(0);
    expect(boundaries.stop_final_source).toHaveBeenCalledTimes(1);
  });

  it("starts ordinary source intake only with its explicit scope and provider probe", async () => {
    vi.stubEnv("PRISM_ROSETTA_QUEUE_CANARY_ID", uuid(1));
    vi.stubEnv("LEGISLATIVE_VERSION_QUEUE_ENABLED", "true");
    vi.stubEnv("LEGISLATIVE_VERSION_CURRENT_SOURCES_ENABLED", "true");
    vi.stubEnv("LEGISCAN_API_KEY", "test-only");
    vi.stubEnv("LEGISCAN_BILL_TEXT_PROBE_DOCUMENT_ID", "123");
    boundaries.bill_text.mockResolvedValue({});
    await import("./prism-rosetta-worker");
    await vi.advanceTimersByTimeAsync(0);
    expect(boundaries.bill_text).toHaveBeenCalledWith(123);
    expect(boundaries.start_legislative).toHaveBeenCalledTimes(1);
  });

  it("does not broaden intake merely because its queue flag is enabled", async () => {
    vi.stubEnv("PRISM_ROSETTA_QUEUE_CANARY_ID", uuid(1));
    vi.stubEnv("LEGISLATIVE_VERSION_QUEUE_ENABLED", "true");
    await expect(import("./prism-rosetta-worker")).rejects.toThrow("prism_worker_legislative_recovery_scope_required");
    expect(boundaries.start_legislative).not.toHaveBeenCalled();
  });

  it.each([
    { canary: "", batch: "", error: "prism_worker_queue_scope_required" },
    { canary: uuid(1), batch: uuid(2), error: "prism_rosetta_queue_selection_conflict" },
    { canary: "invalid", batch: "", error: "prism_rosetta_queue_canary_id_invalid" },
    { canary: "", batch: "invalid", error: "prism_rosetta_queue_batch_ids_invalid" },
    { canary: "", batch: `${uuid(1)},${uuid(1)}`, error: "prism_rosetta_queue_batch_ids_invalid" },
    { canary: "", batch: `${uuid(1)},`, error: "prism_rosetta_queue_batch_ids_invalid" },
    { canary: "", batch: Array.from({ length: 26 }, (_, i) => uuid(i)).join(","), error: "prism_rosetta_queue_batch_ids_invalid" },
  ])("rejects invalid selection before starting either queue: $error", async ({ canary, batch, error }) => {
    vi.stubEnv("PRISM_ROSETTA_QUEUE_CANARY_ID", canary);
    vi.stubEnv("PRISM_ROSETTA_QUEUE_BATCH_IDS", batch);
    await expect(import("./prism-rosetta-worker")).rejects.toThrow(error);
    expect(boundaries.start_prism).not.toHaveBeenCalled();
    expect(boundaries.start_legislative).not.toHaveBeenCalled();
    expect(boundaries.bill_text).not.toHaveBeenCalled();
    expect(signals.size).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([
    { role: "web", enabled: "true", error: "prism_worker_runtime_role_required" },
    { role: "worker", enabled: "false", error: "prism_worker_feature_grant_required" },
  ])("retains the independent runtime and feature grants: $error", async ({ role, enabled, error }) => {
    vi.stubEnv("LIGHTHOUSE_RUNTIME_ROLE", role);
    vi.stubEnv("PRISM_ROSETTA_QUEUE_ENABLED", enabled);
    vi.stubEnv("PRISM_ROSETTA_QUEUE_BATCH_IDS", uuid(1));
    await expect(import("./prism-rosetta-worker")).rejects.toThrow(error);
    expect(boundaries.start_prism).not.toHaveBeenCalled();
    expect(boundaries.start_legislative).not.toHaveBeenCalled();
    expect(signals.size).toBe(0);
  });
});
