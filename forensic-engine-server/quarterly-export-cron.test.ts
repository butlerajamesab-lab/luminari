/**
 * Tests for the Quarterly Spine Export Cron
 *
 * Validates:
 * - startQuarterlyExportCron registers the cron task without error
 * - stopQuarterlyExportCron clears the task
 * - triggerManualQuarterlyExport returns "Already running" when isRunning is true
 * - getQuarterlyExportStatus returns the expected shape
 * - Double-start guard prevents re-registration
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ─── Mock node-cron ───────────────────────────────────────────────────────────

const mockStop = vi.fn();
const mockSchedule = vi.fn(() => ({ stop: mockStop }));

vi.mock("node-cron", () => ({
  schedule: mockSchedule,
}));

// ─── Mock DB ─────────────────────────────────────────────────────────────────

// Chainable query builder mock that supports select().from().where().limit() and select().from().orderBy().limit()
const makeChainableMock = (finalResult: any[] = []) => {
  const chain: any = {};
  chain.from = vi.fn(() => chain);
  chain.where = vi.fn(() => chain);
  chain.orderBy = vi.fn(() => chain);
  chain.limit = vi.fn(() => Promise.resolve(finalResult));
  return chain;
};

vi.mock("./db", () => ({
  db: {
    select: vi.fn(() => makeChainableMock()),
    insert: vi.fn(() => ({
      values: vi.fn(() => Promise.resolve([{ insertId: 1 }])),
    })),
  },
}));

// ─── Mock export-spine-engine ────────────────────────────────────────────────

vi.mock("./engines/export-spine-engine", () => ({
  runExport: vi.fn(() => Promise.resolve({ runId: 1, bundleName: "test-bundle" })),
}));

// ─── Mock notification ────────────────────────────────────────────────────────

vi.mock("./_core/notification", () => ({
  notifyOwner: vi.fn(() => Promise.resolve(true)),
}));

// ─── Mock drizzle-orm ────────────────────────────────────────────────────────

vi.mock("drizzle-orm", () => ({
  desc: vi.fn((col) => col),
  eq: vi.fn((a, b) => ({ a, b })),
}));

// ─── Mock schema ─────────────────────────────────────────────────────────────

vi.mock("../drizzle/schema", () => ({
  exportSpineRuns: { id: "id", createdAt: "createdAt" },
}));

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("Quarterly Export Cron — Lifecycle", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  afterEach(() => {
    // Ensure cron is stopped after each test
    try {
      const mod = require("./quarterly-export-cron");
      mod.stopQuarterlyExportCron?.();
    } catch {
      // Module may not be loaded
    }
  });

  it("startQuarterlyExportCron registers a cron task", async () => {
    const { startQuarterlyExportCron } = await import("./quarterly-export-cron");
    startQuarterlyExportCron();
    expect(mockSchedule).toHaveBeenCalledOnce();
    // The cron expression should be the quarterly schedule
    const cronExpr = mockSchedule.mock.calls[0][0];
    expect(typeof cronExpr).toBe("string");
    expect(cronExpr.length).toBeGreaterThan(0);
  });

  it("startQuarterlyExportCron does not re-register if already scheduled", async () => {
    const { startQuarterlyExportCron } = await import("./quarterly-export-cron");
    startQuarterlyExportCron();
    startQuarterlyExportCron(); // Second call should be a no-op
    expect(mockSchedule).toHaveBeenCalledOnce();
  });

  it("stopQuarterlyExportCron stops the cron task", async () => {
    const { startQuarterlyExportCron, stopQuarterlyExportCron } = await import("./quarterly-export-cron");
    startQuarterlyExportCron();
    stopQuarterlyExportCron();
    expect(mockStop).toHaveBeenCalledOnce();
  });

  it("stopQuarterlyExportCron is safe to call when not started", async () => {
    const { stopQuarterlyExportCron } = await import("./quarterly-export-cron");
    // Should not throw
    expect(() => stopQuarterlyExportCron()).not.toThrow();
    expect(mockStop).not.toHaveBeenCalled();
  });
});

describe("Quarterly Export Cron — Manual Trigger", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("triggerManualQuarterlyExport returns success: false when already running", async () => {
    const { triggerManualQuarterlyExport } = await import("./quarterly-export-cron");

    // Trigger first run (will succeed via mock)
    const firstPromise = triggerManualQuarterlyExport();

    // Trigger second run immediately (should be blocked)
    const secondResult = await triggerManualQuarterlyExport();

    expect(secondResult.success).toBe(false);
    expect(secondResult.error).toBe("Export already in progress");

    // Wait for first to finish
    await firstPromise;
  });

  it("triggerManualQuarterlyExport returns success: true on clean run", async () => {
    // Use a fresh module instance to avoid state bleed from the previous test
    vi.resetModules();
    const { triggerManualQuarterlyExport } = await import("./quarterly-export-cron");
    const result = await triggerManualQuarterlyExport();
    expect(result.success).toBe(true);
    expect(result.bundleName).toBe("test-bundle");
  });
});

describe("Quarterly Export Cron — Status", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("getQuarterlyExportStatus returns expected shape", async () => {
    const { getQuarterlyExportStatus } = await import("./quarterly-export-cron");
    const status = await getQuarterlyExportStatus();

    expect(status).toMatchObject({
      scheduled: expect.any(Boolean),
      isCurrentlyRunning: expect.any(Boolean),
      intervalDays: 90,
      recentRuns: expect.any(Array),
      autoRunCount: expect.any(Number),
    });
  });

  it("getQuarterlyExportStatus shows scheduled=true after start", async () => {
    const { startQuarterlyExportCron, getQuarterlyExportStatus, stopQuarterlyExportCron } = await import("./quarterly-export-cron");
    startQuarterlyExportCron();
    const status = await getQuarterlyExportStatus();
    expect(status.scheduled).toBe(true);
    expect(status.nextRunAt).not.toBeNull();
    stopQuarterlyExportCron();
  });

  it("getQuarterlyExportStatus shows scheduled=false after stop", async () => {
    const { startQuarterlyExportCron, stopQuarterlyExportCron, getQuarterlyExportStatus } = await import("./quarterly-export-cron");
    startQuarterlyExportCron();
    stopQuarterlyExportCron();
    const status = await getQuarterlyExportStatus();
    expect(status.scheduled).toBe(false);
  });
});
