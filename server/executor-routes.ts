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
  runIngestionPipeline,
  refreshSchedules,
  reenableStream,
  resetFailureCounters,
  getSchedulerStatus,
} from "./ingestion/scheduler";
import {
  resetStreamCheckpoint,
} from "./engines/executor-service";
import { db } from "./db";
import { sql } from "drizzle-orm";

export function registerExecutorRoutes(app: Express) {
  // ─── POST /api/executor/runStream ───
  // Run a single stream immediately
  app.post("/api/executor/runStream", async (req: Request, res: Response) => {
    try {
      const { streamId } = req.body;
      if (!streamId) return res.status(400).json({ success: false, error: "streamId required" });

      console.log(`[Executor] runStream: ${streamId}`);
      const result = await triggerManualIngestion(streamId);
      res.json({
        // @ts-expect-error pre-existing type mismatch
        success: true,
        streamId,
        message: `Stream ${streamId} ingestion triggered`,
        ...result,
      });
    } catch (e: any) {
      console.error(`[Executor] runStream error:`, e);
      res.status(500).json({ success: false, error: e.message });
    }
  });

  // ─── POST /api/executor/runAllStreams ───
  // Run all enabled streams sequentially
  app.post("/api/executor/runAllStreams", async (req: Request, res: Response) => {
    try {
      console.log(`[Executor] runAllStreams`);
      // Get all enabled, non-auto-disabled streams
      const rows = await db.execute(sql`
        SELECT stream_id_dsr as streamId FROM data_stream_registry
        WHERE enabled_dsr = 1 AND (auto_disabled_dsr = 0 OR auto_disabled_dsr IS NULL)
        ORDER BY signal_weight_dsr DESC
      `);
      const streams = (rows as any).rows || rows;
      const results: Array<{ streamId: string; success: boolean; message: string; recordsProcessed?: number; signalsGenerated?: number }> = [];
      let succeeded = 0;
      let failed = 0;

      for (const row of streams) {
        const sid = (row as any).streamId;
        try {
          const r = await triggerManualIngestion(sid);
          // @ts-expect-error pre-existing type mismatch
          results.push({ streamId: sid, success: true, message: "OK", ...r });
          succeeded++;
        } catch (e: any) {
          results.push({ streamId: sid, success: false, message: e.message });
          failed++;
        }
      }

      res.json({
        success: true,
        totalStreams: streams.length,
        succeeded,
        failed,
        results,
      });
    } catch (e: any) {
      console.error(`[Executor] runAllStreams error:`, e);
      res.status(500).json({ success: false, error: e.message });
    }
  });

  // ─── POST /api/executor/retryStream ───
  // Retry a specific failed stream (reset counters + run)
  app.post("/api/executor/retryStream", async (req: Request, res: Response) => {
    try {
      const { streamId } = req.body;
      if (!streamId) return res.status(400).json({ success: false, error: "streamId required" });

      console.log(`[Executor] retryStream: ${streamId}`);
      // Reset failure counters first
      await resetFailureCounters(streamId);
      // Re-enable if auto-disabled
      await reenableStream(streamId);
      // Then run
      const result = await triggerManualIngestion(streamId);
      res.json({
        // @ts-expect-error pre-existing type mismatch
        success: true,
        streamId,
        message: `Stream ${streamId} retried (counters reset, re-enabled)`,
        ...result,
      });
    } catch (e: any) {
      console.error(`[Executor] retryStream error:`, e);
      res.status(500).json({ success: false, error: e.message });
    }
  });

  // ─── POST /api/executor/backfillStream ───
  // Reset checkpoint + run (forces full re-ingestion from scratch)
  app.post("/api/executor/backfillStream", async (req: Request, res: Response) => {
    try {
      const { streamId } = req.body;
      if (!streamId) return res.status(400).json({ success: false, error: "streamId required" });

      console.log(`[Executor] backfillStream: ${streamId}`);
      // Reset checkpoint (clear lastIngestedAt so it fetches everything)
      await resetStreamCheckpoint(streamId, "executor-api", "Executor API");
      // Reset failure counters
      await resetFailureCounters(streamId);
      // Re-enable if auto-disabled
      await reenableStream(streamId);
      // Run full ingestion
      const result = await triggerManualIngestion(streamId);
      res.json({
        // @ts-expect-error pre-existing type mismatch
        success: true,
        streamId,
        message: `Stream ${streamId} backfill complete (checkpoint reset, full re-ingestion)`,
        ...result,
      });
    } catch (e: any) {
      console.error(`[Executor] backfillStream error:`, e);
      res.status(500).json({ success: false, error: e.message });
    }
  });

  // ─── POST /api/executor/resetCheckpoint ───
  // Reset checkpoint only (no run)
  app.post("/api/executor/resetCheckpoint", async (req: Request, res: Response) => {
    try {
      const { streamId } = req.body;
      if (!streamId) return res.status(400).json({ success: false, error: "streamId required" });

      console.log(`[Executor] resetCheckpoint: ${streamId}`);
      const result = await resetStreamCheckpoint(streamId, "executor-api", "Executor API");
      res.json({
        success: true,
        streamId,
        message: result.summary || `Checkpoint reset for ${streamId}`,
      });
    } catch (e: any) {
      console.error(`[Executor] resetCheckpoint error:`, e);
      res.status(500).json({ success: false, error: e.message });
    }
  });

  // ─── POST /api/executor/resetCounters ───
  // Reset failure counters only (no run)
  app.post("/api/executor/resetCounters", async (req: Request, res: Response) => {
    try {
      const { streamId } = req.body;
      if (!streamId) return res.status(400).json({ success: false, error: "streamId required" });
      console.log(`[Executor] resetCounters: ${streamId}`);
      await resetFailureCounters(streamId);
      res.json({ success: true, streamId, message: `Failure counters reset for ${streamId}` });
    } catch (e: any) {
      console.error(`[Executor] resetCounters error:`, e);
      res.status(500).json({ success: false, error: e.message });
    }
  });

  // ─── POST /api/executor/reenableStream ───
  // Re-enable an auto-disabled stream
  app.post("/api/executor/reenableStream", async (req: Request, res: Response) => {
    try {
      const { streamId } = req.body;
      if (!streamId) return res.status(400).json({ success: false, error: "streamId required" });
      console.log(`[Executor] reenableStream: ${streamId}`);
      await reenableStream(streamId);
      res.json({ success: true, streamId, message: `Stream ${streamId} re-enabled` });
    } catch (e: any) {
      console.error(`[Executor] reenableStream error:`, e);
      res.status(500).json({ success: false, error: e.message });
    }
  });

  console.log("[Executor] REST routes registered at /api/executor/*");
}
