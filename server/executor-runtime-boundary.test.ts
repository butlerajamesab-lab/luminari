import type { AddressInfo } from "node:net";
import express from "express";
import { afterEach, describe, expect, it, vi } from "vitest";

const scheduler = vi.hoisted(() => ({
  trigger_manual_ingestion: vi.fn(),
  reenable_stream: vi.fn(),
  reset_failure_counters: vi.fn(),
}));
const executor = vi.hoisted(() => ({
  reset_stream_checkpoint: vi.fn(),
}));

vi.mock("./ingestion/scheduler", () => ({
  triggerManualIngestion: scheduler.trigger_manual_ingestion,
  reenableStream: scheduler.reenable_stream,
  resetFailureCounters: scheduler.reset_failure_counters,
}));

vi.mock("./engines/executor-service", () => ({
  resetStreamCheckpoint: executor.reset_stream_checkpoint,
}));

vi.mock("./engines/sunam-stream-selection", () => ({
  get_sunam_run_all_selection: vi.fn(() => ({ selected: [], excluded: [] })),
  summarize_sunam_exclusions: vi.fn(() => ({})),
}));

import { registerExecutorRoutes } from "./executor-routes";

afterEach(() => {
  delete process.env.LIGHTHOUSE_RUNTIME_ROLE;
  vi.clearAllMocks();
});

describe("executor web/runtime boundary", () => {
  it("returns 503 before any executor mutation runs in the web role", async () => {
    process.env.LIGHTHOUSE_RUNTIME_ROLE = "web";
    const app = express();
    app.use(express.json());
    registerExecutorRoutes(app);

    const server = await new Promise<ReturnType<typeof app.listen>>(resolve => {
      const listening = app.listen(0, "127.0.0.1", () => resolve(listening));
    });

    try {
      const address = server.address() as AddressInfo;
      for (const route of [
        "run_stream",
        "run_all_streams",
        "retry_stream",
        "backfill_stream",
        "reset_checkpoint",
        "reset_counters",
        "reenable_stream",
      ]) {
        const response = await fetch(`http://127.0.0.1:${address.port}/api/executor/${route}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ stream_id: "stream-canary" }),
        });
        expect(response.status, route).toBe(503);
        await expect(response.json()).resolves.toMatchObject({
          success: false,
          error: "background_runtime_required",
          runtime_role: { role: "web" },
        });
      }

      expect(scheduler.trigger_manual_ingestion).not.toHaveBeenCalled();
      expect(scheduler.reenable_stream).not.toHaveBeenCalled();
      expect(scheduler.reset_failure_counters).not.toHaveBeenCalled();
      expect(executor.reset_stream_checkpoint).not.toHaveBeenCalled();
    } finally {
      await new Promise<void>((resolve, reject) => server.close(error => {
        if (error) reject(error);
        else resolve();
      }));
    }
  });
});
