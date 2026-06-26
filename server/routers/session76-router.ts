/**
 * Session 76 Router — Luminari Independence Kit
 * 
 * Endpoints for:
 * 1. Export Spine Engine
 * 2. Restore Spine Engine
 * 3. Admin Sovereign Control
 * 4. Data Stream Manager
 * 5. Intervention Timeline Engine
 * 6. System Copilot (Sunam)
 */
import { z } from "zod";
import { router, adminProcedure, protectedProcedure } from "../_core/trpc";

// ─── Export Spine ───
const exportSpineRouter = router({
  runExport: adminProcedure
    .input(z.object({ exportType: z.enum(["full", "schema", "config", "deployment"]) }))
    .mutation(async ({ ctx, input }) => {
      const { runExport } = await import("../engines/export-spine-engine");
      return runExport(input.exportType, ctx.user.id.toString());
    }),

  getHistory: adminProcedure.query(async () => {
    const { getExportHistory } = await import("../engines/export-spine-engine");
    return getExportHistory();
  }),

  getRun: adminProcedure
    .input(z.object({ runId: z.number() }))
    .query(async ({ input }) => {
      const { getExportRun } = await import("../engines/export-spine-engine");
      return getExportRun(input.runId);
    }),

  getStats: adminProcedure.query(async () => {
    const { getExportStats } = await import("../engines/export-spine-engine");
    return getExportStats();
  }),

  exportSchema: adminProcedure.query(async () => {
    const { exportSchema } = await import("../engines/export-spine-engine");
    return exportSchema();
  }),

  exportConfig: adminProcedure.query(async () => {
    const { exportConfig } = await import("../engines/export-spine-engine");
    return exportConfig();
  }),

  // Quarterly auto-export cron status
  getQuarterlyStatus: adminProcedure.query(async () => {
    const { getQuarterlyExportStatus } = await import("../quarterly-export-cron");
    return getQuarterlyExportStatus();
  }),

  // Manually trigger a quarterly export outside the schedule
  triggerQuarterlyExport: adminProcedure.mutation(async () => {
    const { triggerManualQuarterlyExport } = await import("../quarterly-export-cron");
    return triggerManualQuarterlyExport();
  }),
});

// ─── Restore Spine ───
const restoreSpineRouter = router({
  validate: adminProcedure
    .input(z.object({ bundleJson: z.string() }))
    .mutation(async ({ input }) => {
      const { validateBundle } = await import("../engines/restore-spine-engine");
      return validateBundle(input.bundleJson);
    }),

  execute: adminProcedure
    .input(z.object({
      bundleJson: z.string(),
      restoreType: z.enum(["full", "schema", "config", "deployment"]),
    }))
    .mutation(async ({ ctx, input }) => {
      const { executeRestore } = await import("../engines/restore-spine-engine");
      return executeRestore(input.bundleJson, input.restoreType, ctx.user.id.toString());
    }),

  getHistory: adminProcedure.query(async () => {
    const { getRestoreHistory } = await import("../engines/restore-spine-engine");
    return getRestoreHistory();
  }),

  getRun: adminProcedure
    .input(z.object({ runId: z.number() }))
    .query(async ({ input }) => {
      const { getRestoreRun } = await import("../engines/restore-spine-engine");
      return getRestoreRun(input.runId);
    }),
});

// ─── Admin Sovereign Control ───
const adminControlRouter = router({
  // Engine management
  listEngines: adminProcedure.query(async () => {
    const { listEngines } = await import("../engines/admin-sovereign-control");
    return listEngines();
  }),

  addEngine: adminProcedure
    .input(z.object({
      engineId: z.string(),
      engineName: z.string(),
      description: z.string().optional(),
      category: z.string().optional(),
      config: z.record(z.string(), z.any()).optional(),
      version: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { addEngine } = await import("../engines/admin-sovereign-control");
      return addEngine(input, ctx.user.id.toString(), ctx.user.name ?? undefined);
    }),

  removeEngine: adminProcedure
    .input(z.object({ engineId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const { removeEngine } = await import("../engines/admin-sovereign-control");
      return removeEngine(input.engineId, ctx.user.id.toString(), ctx.user.name ?? undefined);
    }),

  toggleEngine: adminProcedure
    .input(z.object({ engineId: z.string(), enabled: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const { toggleEngine } = await import("../engines/admin-sovereign-control");
      return toggleEngine(input.engineId, input.enabled, ctx.user.id.toString(), ctx.user.name ?? undefined);
    }),

  reorderEngines: adminProcedure
    .input(z.object({ orderedIds: z.array(z.string()) }))
    .mutation(async ({ ctx, input }) => {
      const { reorderEngines } = await import("../engines/admin-sovereign-control");
      return reorderEngines(input.orderedIds, ctx.user.id.toString(), ctx.user.name ?? undefined);
    }),

  // Stream management
  listStreams: adminProcedure.query(async () => {
    const { listStreams } = await import("../engines/admin-sovereign-control");
    return listStreams();
  }),

  addStream: adminProcedure
    .input(z.object({
      stream_id: z.string(),
      stream_name: z.string(),
      stream_type: z.string(),
      source_url: z.string().optional(),
      update_frequency: z.string().optional(),
      signal_weight: z.number().optional(),
      confidence_multiplier: z.number().optional(),
      description: z.string().optional(),
      field_mapping: z.record(z.string(), z.string()).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { addStream } = await import("../engines/admin-sovereign-control");
      const result = await addStream(input, ctx.user.id.toString(), ctx.user.name ?? undefined);
      // Auto-refresh scheduler after stream change
      try { const { refreshSchedules } = await import("../ingestion/scheduler"); await refreshSchedules(); } catch {}
      return result;
    }),

  editStream: adminProcedure
    .input(z.object({
      stream_id: z.string(),
      updates: z.object({
        stream_name: z.string().optional(),
        signal_weight: z.number().optional(),
        confidence_multiplier: z.number().optional(),
        enabled: z.boolean().optional(),
        description: z.string().optional(),
        source_url: z.string().optional(),
        update_frequency: z.string().optional(),
      }),
    }))
    .mutation(async ({ ctx, input }) => {
      const { editStream } = await import("../engines/admin-sovereign-control");
      const result = await editStream(input.stream_id, input.updates, ctx.user.id.toString(), ctx.user.name ?? undefined);
      try { const { refreshSchedules } = await import("../ingestion/scheduler"); await refreshSchedules(); } catch {}
      return result;
    }),

  disableStream: adminProcedure
    .input(z.object({ stream_id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const { disableStream } = await import("../engines/admin-sovereign-control");
      const result = await disableStream(input.stream_id, ctx.user.id.toString(), ctx.user.name ?? undefined);
      try { const { refreshSchedules } = await import("../ingestion/scheduler"); await refreshSchedules(); } catch {}
      return result;
    }),

  // Schema management
  listTables: adminProcedure.query(async () => {
    const { listTables } = await import("../engines/admin-sovereign-control");
    return listTables();
  }),

  inspectTable: adminProcedure
    .input(z.object({ tableName: z.string() }))
    .query(async ({ input }) => {
      const { inspectTable } = await import("../engines/admin-sovereign-control");
      return inspectTable(input.tableName);
    }),

  // Migration runner
  previewSql: adminProcedure
    .input(z.object({ sql: z.string() }))
    .mutation(async ({ input }) => {
      const { previewSql } = await import("../engines/admin-sovereign-control");
      return previewSql(input.sql);
    }),

  executeSql: adminProcedure
    .input(z.object({ sql: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const { executeSql } = await import("../engines/admin-sovereign-control");
      return executeSql(input.sql, ctx.user.id.toString(), ctx.user.name ?? undefined);
    }),

  // Change log
  getChangeLog: adminProcedure
    .input(z.object({ limit: z.number().optional() }).optional())
    .query(async ({ input }) => {
      const { getChangeLog } = await import("../engines/admin-sovereign-control");
      return getChangeLog(input?.limit);
    }),

  rollbackChange: adminProcedure
    .input(z.object({ changeId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const { rollbackChange } = await import("../engines/admin-sovereign-control");
      return rollbackChange(input.changeId, ctx.user.id.toString(), ctx.user.name ?? undefined);
    }),

  // System stats
  getSystemStats: adminProcedure.query(async () => {
    const { getSystemStats } = await import("../engines/admin-sovereign-control");
    return getSystemStats();
  }),
});

// ─── Data Stream Manager ───
const dataStreamRouter = router({
  getStreamsWithHealth: adminProcedure.query(async () => {
    const { getStreamsWithHealth } = await import("../engines/data-stream-manager");
    return getStreamsWithHealth();
  }),

  getStreamDetail: adminProcedure
    .input(z.object({ stream_id: z.string() }))
    .query(async ({ input }) => {
      const { getStreamDetail } = await import("../engines/data-stream-manager");
      return getStreamDetail(input.stream_id);
    }),

  createStream: adminProcedure
    .input(z.object({
      stream_id: z.string(),
      stream_name: z.string(),
      stream_type: z.string(),
      source_url: z.string().optional(),
      update_frequency: z.string().optional(),
      signal_weight: z.number().optional(),
      confidence_multiplier: z.number().optional(),
      description: z.string().optional(),
      field_mapping: z.record(z.string(), z.string()).optional(),
    }))
    .mutation(async ({ input }) => {
      const { createStream } = await import("../engines/data-stream-manager");
      const result = await createStream(input);
      try { const { refreshSchedules } = await import("../ingestion/scheduler"); await refreshSchedules(); } catch {}
      return result;
    }),

  updateStream: adminProcedure
    .input(z.object({
      stream_id: z.string(),
      updates: z.object({
        stream_name: z.string().optional(),
        signal_weight: z.number().optional(),
        confidence_multiplier: z.number().optional(),
        enabled: z.boolean().optional(),
        description: z.string().optional(),
        source_url: z.string().optional(),
        update_frequency: z.string().optional(),
        field_mapping: z.record(z.string(), z.string()).optional(),
      }),
    }))
    .mutation(async ({ input }) => {
      const { updateStream } = await import("../engines/data-stream-manager");
      const result = await updateStream(input.stream_id, input.updates);
      try { const { refreshSchedules } = await import("../ingestion/scheduler"); await refreshSchedules(); } catch {}
      return result;
    }),

  deleteStream: adminProcedure
    .input(z.object({ stream_id: z.string() }))
    .mutation(async ({ input }) => {
      const { deleteStream } = await import("../engines/data-stream-manager");
      const result = await deleteStream(input.stream_id);
      try { const { refreshSchedules } = await import("../ingestion/scheduler"); await refreshSchedules(); } catch {}
      return result;
    }),

  getStreamStats: adminProcedure.query(async () => {
    const { getStreamStats } = await import("../engines/data-stream-manager");
    return getStreamStats();
  }),

  getStreamTypes: adminProcedure.query(async () => {
    const { STREAM_TYPES, UPDATE_FREQUENCIES } = await import("../engines/data-stream-manager");
    return { stream_types: STREAM_TYPES, update_frequencies: UPDATE_FREQUENCIES };
  }),
});

// ─── Intervention Timeline ───
const interventionTimelineRouter = router({
  recordEvent: adminProcedure
    .input(z.object({
      patternId: z.string(),
      eventType: z.enum(["pattern_detected", "strategy_generated", "intervention_started", "intervention_completed", "outcome_recorded", "trend_shift", "policy_change"]),
      title: z.string(),
      description: z.string().optional(),
      eventSource: z.string().optional(),
      impactScore: z.number().optional(),
      metadata: z.record(z.string(), z.any()).optional(),
      timestamp: z.number().optional(),
    }))
    .mutation(async ({ input }) => {
      const { recordTimelineEvent } = await import("../engines/intervention-timeline-engine");
      return recordTimelineEvent(input);
    }),

  getPatternTimeline: protectedProcedure
    .input(z.object({ patternId: z.string() }))
    .query(async ({ input }) => {
      const { getPatternTimeline } = await import("../engines/intervention-timeline-engine");
      return getPatternTimeline(input.patternId);
    }),

  getAllTimelines: protectedProcedure
    .input(z.object({ limit: z.number().optional() }).optional())
    .query(async ({ input }) => {
      const { getAllTimelines } = await import("../engines/intervention-timeline-engine");
      return getAllTimelines(input?.limit);
    }),

  getRecentEvents: protectedProcedure
    .input(z.object({ limit: z.number().optional() }).optional())
    .query(async ({ input }) => {
      const { getRecentEvents } = await import("../engines/intervention-timeline-engine");
      return getRecentEvents(input?.limit);
    }),

  getStats: protectedProcedure.query(async () => {
    const { getTimelineStats } = await import("../engines/intervention-timeline-engine");
    return getTimelineStats();
  }),

  deleteEvent: adminProcedure
    .input(z.object({ eventId: z.number() }))
    .mutation(async ({ input }) => {
      const { deleteTimelineEvent } = await import("../engines/intervention-timeline-engine");
      return deleteTimelineEvent(input.eventId);
    }),

  updateEvent: adminProcedure
    .input(z.object({
      eventId: z.number(),
      updates: z.object({
        title: z.string().optional(),
        description: z.string().optional(),
        impactScore: z.number().optional(),
        metadata: z.record(z.string(), z.any()).optional(),
      }),
    }))
    .mutation(async ({ input }) => {
      const { updateTimelineEvent } = await import("../engines/intervention-timeline-engine");
      return updateTimelineEvent(input.eventId, input.updates);
    }),

  getEventTypes: protectedProcedure.query(async () => {
    const { EVENT_TYPES } = await import("../engines/intervention-timeline-engine");
    return EVENT_TYPES;
  }),
});

// ─── System Copilot (Sunam) ───
const copilotRouter = router({
  createConversation: adminProcedure
    .input(z.object({ title: z.string().optional() }).optional())
    .mutation(async ({ ctx, input }) => {
      const { createConversation } = await import("../engines/system-copilot-sunam");
      return createConversation(ctx.user.id.toString(), input?.title);
    }),

  getConversations: adminProcedure.query(async ({ ctx }) => {
    const { getConversations } = await import("../engines/system-copilot-sunam");
    return getConversations(ctx.user.id.toString());
  }),

  getMessages: adminProcedure
    .input(z.object({ conversationId: z.number() }))
    .query(async ({ input }) => {
      const { getConversationMessages } = await import("../engines/system-copilot-sunam");
      return getConversationMessages(input.conversationId);
    }),

  chat: adminProcedure
    .input(z.object({ conversationId: z.number(), message: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const { chat } = await import("../engines/system-copilot-sunam");
      return chat(input.conversationId, input.message, ctx.user.id.toString());
    }),

  archiveConversation: adminProcedure
    .input(z.object({ conversationId: z.number() }))
    .mutation(async ({ input }) => {
      const { archiveConversation } = await import("../engines/system-copilot-sunam");
      return archiveConversation(input.conversationId);
    }),

  // Artifact management
  getArtifact: adminProcedure
    .input(z.object({ artifactId: z.number() }))
    .query(async ({ input }) => {
      const { getArtifact } = await import("../engines/system-copilot-sunam");
      return getArtifact(input.artifactId);
    }),

  getPendingArtifacts: adminProcedure.query(async () => {
    const { getPendingArtifacts } = await import("../engines/system-copilot-sunam");
    return getPendingArtifacts();
  }),

  approveArtifact: adminProcedure
    .input(z.object({ artifactId: z.number() }))
    .mutation(async ({ input }) => {
      const { approveArtifact } = await import("../engines/system-copilot-sunam");
      return approveArtifact(input.artifactId);
    }),

  rejectArtifact: adminProcedure
    .input(z.object({ artifactId: z.number() }))
    .mutation(async ({ input }) => {
      const { rejectArtifact } = await import("../engines/system-copilot-sunam");
      return rejectArtifact(input.artifactId);
    }),

  executeArtifact: adminProcedure
    .input(z.object({ artifactId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const { executeArtifact } = await import("../engines/system-copilot-sunam");
      return executeArtifact(input.artifactId, ctx.user.id.toString());
    }),

  rollbackArtifact: adminProcedure
    .input(z.object({ artifactId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const { rollbackArtifact } = await import("../engines/system-copilot-sunam");
      return rollbackArtifact(input.artifactId, ctx.user.id.toString());
    }),

  // Quick inspect
  inspectTable: adminProcedure
    .input(z.object({ tableName: z.string() }))
    .query(async ({ input }) => {
      const { inspectTable } = await import("../engines/system-copilot-sunam");
      return inspectTable(input.tableName);
    }),

  // ─── DIRECT EXECUTION — No artifact, no approval, immediate action ───
  // Sunam receives an instruction, calls tools directly, returns results.
  // This is the full operator endpoint.
  execute: protectedProcedure
    .input(z.object({
      instruction: z.string().describe("Natural language instruction for Sunam to execute"),
      maxSteps: z.number().default(10).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { sunamExecute } = await import("../engines/sunam-executor");
      return sunamExecute(
        input.instruction,
        ctx.user.id.toString(),
        ctx.user.name ?? undefined,
        input.maxSteps ?? 10,
      );
    }),

  // Get available tools for Sunam (for UI display)
  getTools: protectedProcedure.query(async () => {
    const { SUNAM_TOOLS } = await import("../engines/sunam-executor");
    return SUNAM_TOOLS.map(t => ({
      name: t.function.name,
      description: t.function.description,
      parameters: t.function.parameters,
    }));
  }),

  // Direct tool dispatch — call a single tool by name with args
  dispatchTool: protectedProcedure
    .input(z.object({
      toolName: z.string(),
      args: z.record(z.string(), z.any()),
    }))
    .mutation(async ({ ctx, input }) => {
      const { dispatchTool } = await import("../engines/sunam-executor");
      return dispatchTool(input.toolName, input.args, ctx.user.id.toString());
    }),
});

// ─── Execution Bridge ───
// These endpoints call the EXACT SAME functions as Mission Control's ingestion router.
// No duplicate logic. Single execution path.
const executionBridgeRouter = router({
  // Run a single stream — calls triggerManualIngestion (same as ingestion.triggerIngestion)
  runStream: adminProcedure
    .input(z.object({
      stream_id: z.string(),
      maxRecords: z.number().optional(),
    }))
    .mutation(async ({ input }) => {
      const { triggerManualIngestion } = await import("../ingestion/scheduler");
      const result = await Promise.race([
        triggerManualIngestion(input.stream_id, input.maxRecords),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 120_000)),
      ]);
      if (!result) {
        return { success: true, message: "Ingestion started (running in background)", status: "running" as const, records_processed: 0, signals_generated: 0, errors: [] as string[] };
      }
      return {
        success: result.success,
        message: result.success
          ? `Processed ${result.recordsProcessed} records, ${result.signalsGenerated} signals generated`
          : `Failed: ${result.errors.join(", ")}`,
        status: (result.success ? "completed" : "failed") as "completed" | "failed",
        records_processed: result.recordsProcessed,
        records_inserted: result.recordsInserted,
        records_updated: result.recordsUpdated,
        signals_generated: result.signalsGenerated,
        errors: result.errors,
        run_id: result.runId,
      };
    }),

  // Run ALL enabled streams — calls the same triggerManualIngestion for each
  runAllStreams: adminProcedure.mutation(async () => {
    const { pool } = await import("../db");
    const { triggerManualIngestion } = await import("../ingestion/scheduler");
    const streamResult = await pool.query(`
      SELECT stream_id_dsr AS stream_id, stream_name_dsr AS stream_name
      FROM data_stream_registry
      WHERE enabled_dsr = true
      ORDER BY stream_id_dsr ASC
    `);
    const streams = (Array.isArray(streamResult) ? streamResult[0] : streamResult.rows) as Array<{ stream_id: string; stream_name: string | null }>;
    const results: Array<{ stream_id: string; stream_name: string; success: boolean; message: string }> = [];
    for (const stream of streams) {
      try {
        const result = await Promise.race([
          triggerManualIngestion(stream.stream_id),
          new Promise<null>((resolve) => setTimeout(() => resolve(null), 120_000)),
        ]);
        results.push({
          stream_id: stream.stream_id,
          stream_name: stream.stream_name ?? stream.stream_id,
          success: result?.success ?? true,
          message: result
            ? (result.success ? `${result.recordsProcessed} records, ${result.signalsGenerated} signals` : result.errors.join(", "))
            : "Running in background",
        });
      } catch (err) {
        results.push({
          stream_id: stream.stream_id,
          stream_name: stream.stream_name ?? stream.stream_id,
          success: false,
          message: err instanceof Error ? err.message : String(err),
        });
      }
    }
    return {
      total_streams: streams.length,
      succeeded: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length,
      results,
    };
  }),

  // Retry failed runs — find recent failed runs and re-trigger their streams
  retryFailedRuns: adminProcedure
    .input(z.object({ hoursBack: z.number().default(24) }).optional())
    .mutation(async ({ input }) => {
      const { ingestRuns } = await import("../../drizzle/schema");
      const { db } = await import("../db");
      const { eq, sql } = await import("drizzle-orm");
      const { triggerManualIngestion } = await import("../ingestion/scheduler");
      const hoursBack = input?.hoursBack ?? 24;
      const cutoff = Date.now() - hoursBack * 60 * 60 * 1000;
      const failedRuns = await db.select({
        datasetId: ingestRuns.datasetId,
        id: ingestRuns.id,
      })
        .from(ingestRuns)
        .where(sql`${ingestRuns.status} = 'failed' AND ${ingestRuns.startTime} > ${cutoff}`)
        .groupBy(ingestRuns.datasetId, ingestRuns.id);
      // Deduplicate by datasetId (retry each stream once)
      const uniqueStreams: string[] = Array.from(new Set<string>(failedRuns.map((r: any) => r.datasetId).filter((id: unknown): id is string => typeof id === "string" && id.length > 0)));
      const results: Array<{ stream_id: string; success: boolean; message: string }> = [];
      for (const stream_id of uniqueStreams) {
        try {
          const result = await Promise.race([
            triggerManualIngestion(stream_id),
            new Promise<null>((resolve) => setTimeout(() => resolve(null), 120_000)),
          ]);
          results.push({
            stream_id,
            success: result?.success ?? true,
            message: result
              ? (result.success ? `Retried: ${result.recordsProcessed} records` : result.errors.join(", "))
              : "Retry running in background",
          });
        } catch (err) {
          results.push({
            stream_id,
            success: false,
            message: err instanceof Error ? err.message : String(err),
          });
        }
      }
      return {
        failed_runs_found: failedRuns.length,
        unique_streams_retried: uniqueStreams.length,
        succeeded: results.filter(r => r.success).length,
        failed: results.filter(r => !r.success).length,
        results,
      };
    }),

  // Get stream execution status — stream identity/metrics come from the unified query layer
  getStreamStatus: adminProcedure
    .input(z.object({ stream_id: z.string() }))
    .query(async ({ input }) => {
      const { ingestRuns } = await import("../../drizzle/schema");
      const { db } = await import("../db");
      const { eq, sql, desc } = await import("drizzle-orm");
      const { isDatasetRunning, isDatasetQueued } = await import("../ingestion/scheduler");
      const { get_unified_ingestion_metrics } = await import("../unified-queries");
      const [stream] = await get_unified_ingestion_metrics({ stream_id: input.stream_id });
      const recent_runs = await db.select()
        .from(ingestRuns)
        .where(eq(ingestRuns.datasetId, input.stream_id))
        .orderBy(desc(ingestRuns.startTime))
        .limit(10);
      const [stats] = await db.select({
        total_runs: sql<number>`COUNT(*)`,
        successful_runs: sql<number>`SUM(CASE WHEN ${ingestRuns.status} = 'completed' THEN 1 ELSE 0 END)`,
        failed_runs: sql<number>`SUM(CASE WHEN ${ingestRuns.status} = 'failed' THEN 1 ELSE 0 END)`,
        total_records: sql<number>`SUM(${ingestRuns.recordsProcessed})`,
        total_signals: sql<number>`SUM(${ingestRuns.signalsGenerated})`,
      })
        .from(ingestRuns)
        .where(eq(ingestRuns.datasetId, input.stream_id));
      return {
        stream: stream ?? null,
        is_running: isDatasetRunning(input.stream_id),
        is_queued: isDatasetQueued(input.stream_id),
        recent_runs,
        stats: stats ?? { total_runs: 0, successful_runs: 0, failed_runs: 0, total_records: 0, total_signals: 0 },
      };
    }),

  // Get scheduler status — same function as used internally
  getSchedulerStatus: adminProcedure.query(async () => {
    const { getSchedulerStatus } = await import("../ingestion/scheduler");
    return getSchedulerStatus();
  }),

  // ─── Self-Healing Controls (Session 80) ───

  // Re-enable an auto-disabled stream
  reenableStream: adminProcedure
    .input(z.object({ stream_id: z.string() }))
    .mutation(async ({ input }) => {
      const { reenableStream } = await import("../ingestion/scheduler");
      return reenableStream(input.stream_id);
    }),

  // Reset failure counters for a stream
  resetFailureCounters: adminProcedure
    .input(z.object({ stream_id: z.string() }))
    .mutation(async ({ input }) => {
      const { resetFailureCounters } = await import("../ingestion/scheduler");
      return resetFailureCounters(input.stream_id);
    }),

  // Refresh all schedules (re-reads registry, reschedules all)
  refreshSchedules: adminProcedure.mutation(async () => {
    const { refreshSchedules } = await import("../ingestion/scheduler");
    await refreshSchedules();
    const { getSchedulerStatus } = await import("../ingestion/scheduler");
    return { success: true, ...getSchedulerStatus() };
  }),

  // Update stream configuration (api_url, cron_expression, field_mapping, etc.)
  updateStreamConfig: adminProcedure
    .input(z.object({
      stream_id: z.string(),
      api_url: z.string().optional(),
      cron_expression: z.string().optional(),
      field_mapping: z.record(z.string(), z.string()).optional(),
      source_url: z.string().optional(),
      parser_mode: z.string().optional(),
      post_processing_engine_name: z.string().optional(),
      rationale: z.string().min(10).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { governedDataStreamConfigChange } = await import("../governance-hooks");
      const { stream_id, rationale, ...updates } = input;
      const changes: Record<string, unknown> = {};
      if (updates.api_url !== undefined) changes.api_url = updates.api_url;
      if (updates.cron_expression !== undefined) changes.cron_expression = updates.cron_expression;
      if (updates.field_mapping !== undefined) changes.field_mapping = updates.field_mapping;
      if (updates.source_url !== undefined) changes.source_url = updates.source_url;
      if (updates.parser_mode !== undefined) changes.parser_mode = updates.parser_mode;
      if (updates.post_processing_engine_name !== undefined) changes.post_processing_engine_name = updates.post_processing_engine_name;
      // GOVERNED: Data stream config change
      await governedDataStreamConfigChange({
        stream_id,
        changes,
        rationale: rationale ?? `Stream configuration updated via sovereign control: ${Object.keys(changes).join(", ")}`,
        actorId: ctx.user.open_id,
        actorRole: "admin",
      });
      // Refresh schedules if cron changed
      if (updates.cron_expression) {
        try { const { refreshSchedules } = await import("../ingestion/scheduler"); await refreshSchedules(); } catch {}
      }
      return { success: true };
    }),

  // ─── Engine Operational Control (Session 80) ───

  // Reorder engines
  reorderEngines: adminProcedure
    .input(z.object({ orderedIds: z.array(z.string()) }))
    .mutation(async ({ ctx, input }) => {
      const { reorderEngines } = await import("../engines/admin-sovereign-control");
      return reorderEngines(input.orderedIds, ctx.user.id.toString(), ctx.user.name ?? undefined);
    }),

  // Update engine config
  updateEngineConfig: adminProcedure
    .input(z.object({
      engineId: z.string(),
      config: z.record(z.string(), z.any()).optional(),
      version: z.string().optional(),
      description: z.string().optional(),
      category: z.string().optional(),
      rationale: z.string().min(10).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { governedEngineConfigDB } = await import("../governance-hooks");
      const changes: Record<string, unknown> = {};
      if (input.config !== undefined) changes.configJson = input.config;
      if (input.version !== undefined) changes.version = input.version;
      if (input.description !== undefined) changes.description = input.description;
      if (input.category !== undefined) changes.category = input.category;
      // GOVERNED: Engine config change
      await governedEngineConfigDB({
        engineId: input.engineId,
        changes,
        rationale: input.rationale ?? `Engine configuration updated via sovereign control: ${Object.keys(changes).join(", ")}`,
        actorId: ctx.user.open_id,
        actorRole: "admin",
      });
      return { success: true };
    }),

  // Get stream diagnostics (last run details with unified stream metrics)
  getStreamDiagnostics: adminProcedure
    .input(z.object({ stream_id: z.string() }))
    .query(async ({ input }) => {
      const { ingestRuns } = await import("../../drizzle/schema");
      const { db } = await import("../db");
      const { eq, desc } = await import("drizzle-orm");
      const { get_unified_ingestion_metrics } = await import("../unified-queries");
      const [stream] = await get_unified_ingestion_metrics({ stream_id: input.stream_id });
      const [last_run] = await db.select().from(ingestRuns).where(eq(ingestRuns.datasetId, input.stream_id)).orderBy(desc(ingestRuns.startTime)).limit(1);
      return {
        stream: stream ?? null,
        last_run: last_run ? {
          id: last_run.id,
          status: last_run.status,
          start_time: Number(last_run.startTime),
          end_time: last_run.endTime ? Number(last_run.endTime) : null,
          records_processed: last_run.recordsProcessed,
          signals_generated: last_run.signalsGenerated,
          error_classification: last_run.errorClassification,
          http_status: last_run.httpStatus,
          content_type: last_run.contentType,
          endpoint_attempted: last_run.endpointAttempted,
          adapter_used: last_run.adapterUsed,
          body_preview: last_run.bodyPreview,
          retry_count: last_run.retryCount,
          failure_classification: last_run.failureClassification,
          suggested_remediation: last_run.suggestedRemediation,
          outcome_classification: last_run.outcomeClassification,
          errors: last_run.errors,
          summary: last_run.summary,
        } : null,
      };
    }),

  // ─── Executor Service Endpoints (Session 81) ───

  // Reset stream checkpoint — clears lastIngestedAt for force re-ingestion
  resetCheckpoint: adminProcedure
    .input(z.object({ stream_id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const { resetStreamCheckpoint } = await import("../engines/executor-service");
      return resetStreamCheckpoint(input.stream_id, ctx.user.id.toString(), ctx.user.name ?? undefined);
    }),

  // Force re-ingestion — reset checkpoint + immediately run
  forceReingestion: adminProcedure
    .input(z.object({ stream_id: z.string(), maxRecords: z.number().optional() }))
    .mutation(async ({ ctx, input }) => {
      const { resetStreamCheckpoint } = await import("../engines/executor-service");
      const resetResult = await resetStreamCheckpoint(input.stream_id, ctx.user.id.toString(), ctx.user.name ?? undefined);
      if (!resetResult.success) return { ...resetResult, records_processed: 0, signals_generated: 0 };
      // Now run the stream
      const { triggerManualIngestion } = await import("../ingestion/scheduler");
      const result = await Promise.race([
        triggerManualIngestion(input.stream_id, input.maxRecords),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 120_000)),
      ]);
      if (!result) return { success: true, summary: "Checkpoint reset + ingestion started (running in background)", records_processed: 0, signals_generated: 0 };
      return {
        success: result.success,
        summary: `Checkpoint reset + ${result.success ? `ingested ${result.recordsProcessed} records, ${result.signalsGenerated} signals` : `failed: ${result.errors.join(", ")}`}`,
        records_processed: result.recordsProcessed,
        signals_generated: result.signalsGenerated,
        errors: result.errors,
      };
    }),

  // Apply engine patch via executor service (with diff, impact analysis, rollback)
  applyEnginePatch: adminProcedure
    .input(z.object({
      engineId: z.string(),
      updates: z.object({
        engineName: z.string().optional(),
        description: z.string().optional(),
        category: z.string().optional(),
        version: z.string().optional(),
        configJson: z.record(z.string(), z.any()).optional(),
        enabled: z.boolean().optional(),
        sortOrder: z.number().optional(),
      }),
    }))
    .mutation(async ({ ctx, input }) => {
      const { applyEnginePatch } = await import("../engines/executor-service");
      return applyEnginePatch(input.engineId, input.updates, ctx.user.id.toString(), ctx.user.name ?? undefined);
    }),

  // Apply stream patch via executor service (with diff, impact analysis, rollback)
  applyStreamPatch: adminProcedure
    .input(z.object({
      stream_id: z.string(),
      updates: z.object({
        stream_name: z.string().optional(),
        api_url: z.string().optional(),
        source_url: z.string().optional(),
        field_mapping: z.record(z.string(), z.string()).optional(),
        cron_expression: z.string().optional(),
        signal_weight: z.number().optional(),
        confidence_multiplier: z.number().optional(),
        enabled: z.boolean().optional(),
        post_processing_engine_name: z.string().optional(),
        parser_mode: z.string().optional(),
      }),
    }))
    .mutation(async ({ ctx, input }) => {
      const { applyStreamPatch } = await import("../engines/executor-service");
      const result = await applyStreamPatch(input.stream_id, input.updates, ctx.user.id.toString(), ctx.user.name ?? undefined);
      // Refresh schedules if cron changed
      if (result.success && input.updates.cron_expression) {
        try { const { refreshSchedules } = await import("../ingestion/scheduler"); await refreshSchedules(); } catch {}
      }
      return result;
    }),

  // Apply schema patch via executor service (with rollback SQL)
  applySchemaPatch: adminProcedure
    .input(z.object({
      sql: z.string(),
      rollbackSql: z.string().nullable().optional(),
      description: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { applySchemaPatch } = await import("../engines/executor-service");
      return applySchemaPatch(input.sql, input.rollbackSql ?? null, input.description, ctx.user.id.toString(), ctx.user.name ?? undefined);
    }),

  // Rollback a patch by change log ID
  rollbackPatch: adminProcedure
    .input(z.object({ changeId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const { rollbackPatch } = await import("../engines/executor-service");
      return rollbackPatch(input.changeId, ctx.user.id.toString(), ctx.user.name ?? undefined);
    }),

  // Get execution log
  getExecutionLog: adminProcedure
    .input(z.object({ limit: z.number().default(50) }).optional())
    .query(async ({ input }) => {
      const { getExecutionLog } = await import("../engines/executor-service");
      return getExecutionLog(input?.limit ?? 50);
    }),

  // List ingestion runs — same data as Mission Control's listRuns
  listRuns: adminProcedure
    .input(z.object({
      stream_id: z.string().optional(),
      status: z.enum(["running", "completed", "failed"]).optional(),
      limit: z.number().default(50),
    }).optional())
    .query(async ({ input }) => {
      const { ingestRuns } = await import("../../drizzle/schema");
      const { db } = await import("../db");
      const { eq, sql, desc, and } = await import("drizzle-orm");
      const conditions: any[] = [];
      if (input?.stream_id) conditions.push(eq(ingestRuns.datasetId, input.stream_id));
      if (input?.status) conditions.push(eq(ingestRuns.status, input.status));
      const runs = await db.select()
        .from(ingestRuns)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(ingestRuns.startTime))
        .limit(input?.limit ?? 50);
      return runs;
    }),
});

// ─── Combined Router ───
export const session76Router = router({
  exportSpine: exportSpineRouter,
  restoreSpine: restoreSpineRouter,
  adminControl: adminControlRouter,
  dataStream: dataStreamRouter,
  interventionTimeline: interventionTimelineRouter,
  copilot: copilotRouter,
  execution: executionBridgeRouter,
});
