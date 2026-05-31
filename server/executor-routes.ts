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
import { db } from "./db";
import { sql } from "drizzle-orm";

type ExecutorResult = {
  recordsProcessed?: number;
  records_processed?: number;
  signalsGenerated?: number;
  signals_generated?: number;
  [key: string]: unknown;
};

function normalizeExecutorResult(result: ExecutorResult = {}) {
  const {
    recordsProcessed,
    records_processed,
    signalsGenerated,
    signals_generated,
    ...rest
  } = result;

  return {
    ...rest,
    records_processed: records_processed ?? recordsProcessed,
    signals_generated: signals_generated ?? signalsGenerated,
  };
}

export function registerExecutorRoutes(app: Express) {
  // ─── POST /api/executor/run_stream ───
  // Run a single stream immediately
  app.post("/api/executor/run_stream", async (req: Request, res: Response) => {
    try {
      const { stream_id } = req.body;
      if (!stream_id) return res.status(400).json({ success: false, error: "stream_id required" });

      console.log(`[Executor] run_stream: ${stream_id}`);
      const result = normalizeExecutorResult(await triggerManualIngestion(stream_id));
      res.json({
        success: true,
        stream_id,
        message: `Stream ${stream_id} ingestion triggered`,
        ...result,
      });
    } catch (e: any) {
      console.error(`[Executor] run_stream error:`, e);
      res.status(500).json({ success: false, error: e.message });
    }
  });

  // ─── POST /api/executor/run_all_streams ───
  // Run all enabled streams sequentially
  app.post("/api/executor/run_all_streams", async (_req: Request, res: Response) => {
    try {
      console.log(`[Executor] run_all_streams`);
      const rows = await db.execute(sql`
        SELECT stream_id_dsr AS stream_id FROM data_stream_registry
        WHERE enabled_dsr = true AND (auto_disabled_dsr = false OR auto_disabled_dsr IS NULL)
        ORDER BY signal_weight_dsr DESC
      `);
      const streams = (rows as any).rows || rows;
      const results: Array<{ stream_id: string; success: boolean; message: string; records_processed?: number; signals_generated?: number }> = [];
      let succeeded = 0;
      let failed = 0;

      for (const row of streams) {
        const stream_id = (row as any).stream_id;
        try {
          const result = normalizeExecutorResult(await triggerManualIngestion(stream_id));
          results.push({ stream_id, success: true, message: "OK", ...result });
          succeeded++;
        } catch (e: any) {
          results.push({ stream_id, success: false, message: e.message });
          failed++;
        }
      }

      res.json({
        success: true,
        total_streams: streams.length,
        succeeded,
        failed,
        results,
      });
    } catch (e: any) {
      console.error(`[Executor] run_all_streams error:`, e);
      res.status(500).json({ success: false, error: e.message });
    }
  });

  // ─── POST /api/executor/retry_stream ───
  // Retry a specific failed stream (reset counters + run)
  app.post("/api/executor/retry_stream", async (req: Request, res: Response) => {
    try {
      const { stream_id } = req.body;
      if (!stream_id) return res.status(400).json({ success: false, error: "stream_id required" });

      console.log(`[Executor] retry_stream: ${stream_id}`);
      await resetFailureCounters(stream_id);
      await reenableStream(stream_id);
      const result = normalizeExecutorResult(await triggerManualIngestion(stream_id));
      res.json({
        success: true,
        stream_id,
        message: `Stream ${stream_id} retried (counters reset, re-enabled)`,
        ...result,
      });
    } catch (e: any) {
      console.error(`[Executor] retry_stream error:`, e);
      res.status(500).json({ success: false, error: e.message });
    }
  });

  // ─── POST /api/executor/backfill_stream ───
  // Reset checkpoint + run (forces full re-ingestion from scratch)
  app.post("/api/executor/backfill_stream", async (req: Request, res: Response) => {
    try {
      const { stream_id } = req.body;
      if (!stream_id) return res.status(400).json({ success: false, error: "stream_id required" });

      console.log(`[Executor] backfill_stream: ${stream_id}`);
      await resetStreamCheckpoint(stream_id, "executor-api", "Executor API");
      await resetFailureCounters(stream_id);
      await reenableStream(stream_id);
      const result = normalizeExecutorResult(await triggerManualIngestion(stream_id));
      res.json({
        success: true,
        stream_id,
        message: `Stream ${stream_id} backfill complete (checkpoint reset, full re-ingestion)`,
        ...result,
      });
    } catch (e: any) {
      console.error(`[Executor] backfill_stream error:`, e);
      res.status(500).json({ success: false, error: e.message });
    }
  });

  // ─── POST /api/executor/reset_checkpoint ───
  // Reset checkpoint only (no run)
  app.post("/api/executor/reset_checkpoint", async (req: Request, res: Response) => {
    try {
      const { stream_id } = req.body;
      if (!stream_id) return res.status(400).json({ success: false, error: "stream_id required" });

      console.log(`[Executor] reset_checkpoint: ${stream_id}`);
      const result = await resetStreamCheckpoint(stream_id, "executor-api", "Executor API");
      res.json({
        success: true,
        stream_id,
        message: result.summary || `Checkpoint reset for ${stream_id}`,
      });
    } catch (e: any) {
      console.error(`[Executor] reset_checkpoint error:`, e);
      res.status(500).json({ success: false, error: e.message });
    }
  });

  // ─── POST /api/executor/reset_counters ───
  // Reset failure counters only (no run)
  app.post("/api/executor/reset_counters", async (req: Request, res: Response) => {
    try {
      const { stream_id } = req.body;
      if (!stream_id) return res.status(400).json({ success: false, error: "stream_id required" });
      console.log(`[Executor] reset_counters: ${stream_id}`);
      await resetFailureCounters(stream_id);
      res.json({ success: true, stream_id, message: `Failure counters reset for ${stream_id}` });
    } catch (e: any) {
      console.error(`[Executor] reset_counters error:`, e);
      res.status(500).json({ success: false, error: e.message });
    }
  });

  // ─── POST /api/executor/reenable_stream ───
  // Re-enable an auto-disabled stream
  app.post("/api/executor/reenable_stream", async (req: Request, res: Response) => {
    try {
      const { stream_id } = req.body;
      if (!stream_id) return res.status(400).json({ success: false, error: "stream_id required" });
      console.log(`[Executor] reenable_stream: ${stream_id}`);
      await reenableStream(stream_id);
      res.json({ success: true, stream_id, message: `Stream ${stream_id} re-enabled` });
    } catch (e: any) {
      console.error(`[Executor] reenable_stream error:`, e);
      res.status(500).json({ success: false, error: e.message });
    }
  });

  console.log("[Executor] REST routes registered at /api/executor/* with snake_case contracts");
}
