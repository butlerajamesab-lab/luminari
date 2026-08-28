/**
 * Direct Executor REST Routes — /api/executor/*
 *
 * No tRPC, no copilot artifacts, no approval system, no abstraction.
 * Direct fetch() from the UI hits these endpoints, which call the
 * scheduler and executor-service functions directly.
 */
import type { Express, Request, Response } from "express";
import {
  triggerManualIngestion,
  reenableStream,
  resetFailureCounters,
} from "./ingestion/scheduler";
import {
  resetStreamCheckpoint,
} from "./engines/executor-service";
import {
  get_sunam_run_all_selection,
  summarize_sunam_exclusions,
} from "./engines/sunam-stream-selection";
import {
  background_workers_allowed,
  resolve_lighthouse_runtime_role,
} from "./runtime-role";

type ExecutorPayload = Record<string, unknown>;
type ExecutorResult = ExecutorPayload & {
  success?: boolean;
};

function camelToSnake(key: string): string {
  return key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
}

function normalizeExecutorResult<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map(item => normalizeExecutorResult(item)) as T;
  }

  if (!value || typeof value !== "object" || Object.getPrototypeOf(value) !== Object.prototype) {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value as ExecutorPayload).map(([key, nestedValue]) => [
      camelToSnake(key),
      normalizeExecutorResult(nestedValue),
    ])
  ) as T;
}

function getExecutorFailureMessage(
  result: ExecutorResult,
  fallback: string,
): string {
  if (Array.isArray(result.errors)) {
    const first_error = result.errors.find(
      (error): error is string => typeof error === "string" && error.trim() !== "",
    );
    if (first_error) return first_error;
  }

  if (typeof result.error === "string" && result.error.trim() !== "") {
    return result.error;
  }

  return fallback;
}

function getStreamId(req: Request, res: Response): string | undefined {
  const stream_id = req.body?.stream_id;
  if (typeof stream_id !== "string" || stream_id.trim() === "") {
    res.status(400).json({ success: false, error: "stream_id required" });
    return undefined;
  }
  return stream_id;
}

function sendExecutorResult(
  res: Response,
  stream_id: string,
  message: string,
  result: ExecutorResult
) {
  const normalized = normalizeExecutorResult(result) as ExecutorResult;
  const success = normalized.success !== false;

  res.json({
    ...normalized,
    success,
    stream_id,
    message: success
      ? message
      : getExecutorFailureMessage(normalized, `Stream ${stream_id} failed`),
  });
}

export function registerExecutorRoutes(app: Express) {
  app.use("/api/executor", (req, res, next) => {
    if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
    if (background_workers_allowed()) return next();

    return res.status(503).json({
      success: false,
      error: "background_runtime_required",
      message: "Executor mutations are disabled on the Lighthouse web service.",
      runtime_role: resolve_lighthouse_runtime_role(),
    });
  });

  // ─── POST /api/executor/run_stream ───
  // Run a single stream immediately
  app.post("/api/executor/run_stream", async (req: Request, res: Response) => {
    try {
      const stream_id = getStreamId(req, res);
      if (!stream_id) return;

      console.log(`[Executor] run_stream: ${stream_id}`);
      const result = await triggerManualIngestion(stream_id);
      sendExecutorResult(res, stream_id, `Stream ${stream_id} ingestion triggered`, result);
    } catch (e: any) {
      console.error("[Executor] run_stream error:", e);
      res.status(500).json({ success: false, error: e.message });
    }
  });

  // ─── POST /api/executor/run_all_streams ───
  // Run every canonical registry-eligible stream sequentially.
  app.post("/api/executor/run_all_streams", async (_req: Request, res: Response) => {
    try {
      console.log("[Executor] run_all_streams");

      // Use the same PostgreSQL-safe, retirement-aware registry selection as
      // Sunam. Do not compare boolean columns to MySQL-style integer literals.
      const selection = await get_sunam_run_all_selection();
      const streams = selection.eligible;
      const results: Array<{
        stream_id: string;
        success: boolean;
        message: string;
        records_processed?: number;
        signals_generated?: number;
      }> = [];
      let succeeded = 0;
      let failed = 0;

      for (const stream of streams) {
        const stream_id = stream.stream_id;
        try {
          const result = normalizeExecutorResult(
            await triggerManualIngestion(stream_id),
          ) as ExecutorResult;
          const run_success = result.success === true;

          results.push({
            ...result,
            stream_id,
            success: run_success,
            message: run_success
              ? "OK"
              : getExecutorFailureMessage(result, "Stream run did not complete successfully"),
          });

          if (run_success) succeeded += 1;
          else failed += 1;
        } catch (e: any) {
          results.push({ stream_id, success: false, message: e.message });
          failed += 1;
        }
      }

      res.json({
        success: true,
        total_streams: streams.length,
        succeeded,
        failed,
        results,
        excluded: summarize_sunam_exclusions(selection),
        registry_truth_source: "data_stream_registry",
        completion_source: "ingest_runs",
      });
    } catch (e: any) {
      console.error("[Executor] run_all_streams error:", e);
      res.status(500).json({ success: false, error: e.message });
    }
  });

  // ─── POST /api/executor/retry_stream ───
  // Retry a specific failed stream (reset counters + run)
  app.post("/api/executor/retry_stream", async (req: Request, res: Response) => {
    try {
      const stream_id = getStreamId(req, res);
      if (!stream_id) return;

      console.log(`[Executor] retry_stream: ${stream_id}`);
      // Reset failure counters first
      await resetFailureCounters(stream_id);
      // Re-enable if auto-disabled
      await reenableStream(stream_id);
      // Then run
      const result = await triggerManualIngestion(stream_id);
      sendExecutorResult(res, stream_id, `Stream ${stream_id} retried (counters reset, re-enabled)`, result);
    } catch (e: any) {
      console.error("[Executor] retry_stream error:", e);
      res.status(500).json({ success: false, error: e.message });
    }
  });

  // ─── POST /api/executor/backfill_stream ───
  // Reset checkpoint + run (forces full re-ingestion from scratch)
  app.post("/api/executor/backfill_stream", async (req: Request, res: Response) => {
    try {
      const stream_id = getStreamId(req, res);
      if (!stream_id) return;

      console.log(`[Executor] backfill_stream: ${stream_id}`);
      // Reset checkpoint (clear lastIngestedAt so it fetches everything)
      await resetStreamCheckpoint(stream_id, "executor-api", "Executor API");
      // Reset failure counters
      await resetFailureCounters(stream_id);
      // Re-enable if auto-disabled
      await reenableStream(stream_id);
      // Run full ingestion
      const result = await triggerManualIngestion(stream_id);
      sendExecutorResult(res, stream_id, `Stream ${stream_id} backfill complete (checkpoint reset, full re-ingestion)`, result);
    } catch (e: any) {
      console.error("[Executor] backfill_stream error:", e);
      res.status(500).json({ success: false, error: e.message });
    }
  });

  // ─── POST /api/executor/reset_checkpoint ───
  // Reset checkpoint only (no run)
  app.post("/api/executor/reset_checkpoint", async (req: Request, res: Response) => {
    try {
      const stream_id = getStreamId(req, res);
      if (!stream_id) return;

      console.log(`[Executor] reset_checkpoint: ${stream_id}`);
      const result = await resetStreamCheckpoint(stream_id, "executor-api", "Executor API");
      res.json({
        success: true,
        stream_id,
        message: result.summary || `Checkpoint reset for ${stream_id}`,
      });
    } catch (e: any) {
      console.error("[Executor] reset_checkpoint error:", e);
      res.status(500).json({ success: false, error: e.message });
    }
  });

  // ─── POST /api/executor/reset_counters ───
  // Reset failure counters only (no run)
  app.post("/api/executor/reset_counters", async (req: Request, res: Response) => {
    try {
      const stream_id = getStreamId(req, res);
      if (!stream_id) return;
      console.log(`[Executor] reset_counters: ${stream_id}`);
      await resetFailureCounters(stream_id);
      res.json({ success: true, stream_id, message: `Failure counters reset for ${stream_id}` });
    } catch (e: any) {
      console.error("[Executor] reset_counters error:", e);
      res.status(500).json({ success: false, error: e.message });
    }
  });

  // ─── POST /api/executor/reenable_stream ───
  // Re-enable an auto-disabled stream
  app.post("/api/executor/reenable_stream", async (req: Request, res: Response) => {
    try {
      const stream_id = getStreamId(req, res);
      if (!stream_id) return;
      console.log(`[Executor] reenable_stream: ${stream_id}`);
      await reenableStream(stream_id);
      res.json({ success: true, stream_id, message: `Stream ${stream_id} re-enabled` });
    } catch (e: any) {
      console.error("[Executor] reenable_stream error:", e);
      res.status(500).json({ success: false, error: e.message });
    }
  });

  console.log("[Executor] REST routes registered at /api/executor/*");
}
