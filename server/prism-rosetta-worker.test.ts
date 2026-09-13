import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const boundaries = vi.hoisted(() => ({
  start_prism: vi.fn(),
  stop_prism: vi.fn(async () => undefined),
  start_legislative: vi.fn(),
  stop_legislative: vi.fn(async () => undefined),
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
  start_legislative_version_queue_worker: boundaries.start_legislative,
  stop_legislative_version_queue_worker: boundaries.stop_legislative,
}));
vi.mock("./services/legiscan", () => ({ get_bill_text: boundaries.bill_text }));

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
    expect(boundaries.start_legislative).not.toHaveBeenCalled();
    expect(signals.has("SIGTERM")).toBe(true);
    expect(signals.has("SIGINT")).toBe(true);
    signals.get("SIGTERM")?.();
    await vi.advanceTimersByTimeAsync(0);
    expect(boundaries.stop_prism).toHaveBeenCalledTimes(1);
    expect(boundaries.pool_end).toHaveBeenCalledTimes(1);
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

