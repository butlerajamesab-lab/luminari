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
      // @ts-expect-error pre-existing type mismatch
      config: z.record(z.any()).optional(),
      version: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { addEngine } = await import("../engines/admin-sovereign-control");
      // @ts-expect-error pre-existing type mismatch
      return addEngine(input, ctx.user.id.toString(), ctx.user.name);
    }),

  removeEngine: adminProcedure
    .input(z.object({ engineId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const { removeEngine } = await import("../engines/admin-sovereign-control");
      // @ts-expect-error pre-existing type mismatch
      return removeEngine(input.engineId, ctx.user.id.toString(), ctx.user.name);
    }),

  toggleEngine: adminProcedure
    .input(z.object({ engineId: z.string(), enabled: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const { toggleEngine } = await import("../engines/admin-sovereign-control");
      // @ts-expect-error pre-existing type mismatch
      return toggleEngine(input.engineId, input.enabled, ctx.user.id.toString(), ctx.user.name);
    }),

  reorderEngines: adminProcedure
    .input(z.object({ orderedIds: z.array(z.string()) }))
    .mutation(async ({ ctx, input }) => {
      const { reorderEngines } = await import("../engines/admin-sovereign-control");
      // @ts-expect-error pre-existing type mismatch
      return reorderEngines(input.orderedIds, ctx.user.id.toString(), ctx.user.name);
    }),

  // Stream management
  listStreams: adminProcedure.query(async () => {
    const { listStreams } = await import("../engines/admin-sovereign-control");
    return listStreams();
  }),

  addStream: adminProcedure
    .input(z.object({
      streamId: z.string(),
      streamName: z.string(),
      streamType: z.string(),
      sourceUrl: z.string().optional(),
      updateFrequency: z.string().optional(),
      signalWeight: z.number().optional(),
      confidenceMultiplier: z.number().optional(),
      description: z.string().optional(),
      // @ts-expect-error pre-existing type mismatch
      fieldMapping: z.record(z.string()).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { addStream } = await import("../engines/admin-sovereign-control");
      // @ts-expect-error pre-existing type mismatch
      const result = await addStream(input, ctx.user.id.toString(), ctx.user.name);
      // Auto-refresh scheduler after stream change
      try { const { refreshSchedules } = await import("../ingestion/scheduler"); await refreshSchedules(); } catch {}
      return result;
    }),

  editStream: adminProcedure
    .input(z.object({
      streamId: z.string(),
      updates: z.object({
        streamName: z.string().optional(),
        signalWeight: z.number().optional(),
        confidenceMultiplier: z.number().optional(),
        enabled: z.boolean().optional(),
        description: z.string().optional(),
        sourceUrl: z.string().optional(),
        updateFrequency: z.string().optional(),
      }),
    }))
    .mutation(async ({ ctx, input }) => {
      const { editStream } = await import("../engines/admin-sovereign-control");
      // @ts-expect-error pre-existing type mismatch
      const result = await editStream(input.streamId, input.updates, ctx.user.id.toString(), ctx.user.name);
      try { const { refreshSchedules } = await import("../ingestion/scheduler"); await refreshSchedules(); } catch {}
      return result;
    }),

  disableStream: adminProcedure
    .input(z.object({ streamId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const { disableStream } = await import("../engines/admin-sovereign-control");
      // @ts-expect-error pre-existing type mismatch
      const result = await disableStream(input.streamId, ctx.user.id.toString(), ctx.user.name);
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
      // @ts-expect-error pre-existing type mismatch
      return executeSql(input.sql, ctx.user.id.toString(), ctx.user.name);
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
      // @ts-expect-error pre-existing type mismatch
      return rollbackChange(input.changeId, ctx.user.id.toString(), ctx.user.name);
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
    .input(z.object({ streamId: z.string() }))
    .query(async ({ input }) => {
      const { getStreamDetail } = await import("../engines/data-stream-manager");
      return getStreamDetail(input.streamId);
    }),

  createStream: adminProcedure
    .input(z.object({
      streamId: z.string(),
      streamName: z.string(),
      streamType: z.string(),
      sourceUrl: z.string().optional(),
      updateFrequency: z.string().optional(),
      signalWeight: z.number().optional(),
      confidenceMultiplier: z.number().optional(),
      description: z.string().optional(),
      // @ts-expect-error pre-existing type mismatch
      fieldMapping: z.record(z.string()).optional(),
    }))
    .mutation(async ({ input }) => {
      const { createStream } = await import("../engines/data-stream-manager");
      // @ts-expect-error pre-existing type mismatch
      const result = await createStream(input);
      try { const { refreshSchedules } = await import("../ingestion/scheduler"); await refreshSchedules(); } catch {}
      return result;
    }),

  updateStream: adminProcedure
    .input(z.object({
      streamId: z.string(),
      updates: z.object({
        streamName: z.string().optional(),
        signalWeight: z.number().optional(),
        confidenceMultiplier: z.number().optional(),
        enabled: z.boolean().optional(),
        description: z.string().optional(),
        sourceUrl: z.string().optional(),
        updateFrequency: z.string().optional(),
        // @ts-expect-error pre-existing type mismatch
        fieldMapping: z.record(z.string()).optional(),
      }),
    }))
    .mutation(async ({ input }) => {
      const { updateStream } = await import("../engines/data-stream-manager");
      // @ts-expect-error pre-existing type mismatch
      const result = await updateStream(input.streamId, input.updates);
      try { const { refreshSchedules } = await import("../ingestion/scheduler"); await refreshSchedules(); } catch {}
      return result;
    }),

  deleteStream: adminProcedure
    .input(z.object({ streamId: z.string() }))
    .mutation(async ({ input }) => {
      const { deleteStream } = await import("../engines/data-stream-manager");
      const result = await deleteStream(input.streamId);
      try { const { refreshSchedules } = await import("../ingestion/scheduler"); await refreshSchedules(); } catch {}
      return result;
    }),

  getStreamStats: adminProcedure.query(async () => {
    const { getStreamStats } = await import("../engines/data-stream-manager");
    return getStreamStats();
  }),

  getStreamTypes: adminProcedure.query(async () => {
    const { STREAM_TYPES, UPDATE_FREQUENCIES } = await import("../engines/data-stream-manager");
    return { streamTypes: STREAM_TYPES, updateFrequencies: UPDATE_FREQUENCIES };
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
      // @ts-expect-error pre-existing type mismatch
      metadata: z.record(z.any()).optional(),
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
        // @ts-expect-error pre-existing type mismatch
        metadata: z.record(z.any()).optional(),
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
        // @ts-expect-error pre-existing type mismatch
        ctx.user.name,
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
      // @ts-expect-error pre-existing type mismatch
      args: z.record(z.any()),
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
      streamId: z.string(),
      maxRecords: z.number().optional(),
    }))
    .mutation(async ({ input }) => {
      const { triggerManualIngestion } = await import("../ingestion/scheduler");
      const result = await Promise.race([
        triggerManualIngestion(input.streamId, input.maxRecords),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 120_000)),
      ]);
      if (!result) {
        return { success: true, message: "Ingestion started (running in background)", status: "running" as const, recordsProcessed: 0, signalsGenerated: 0, errors: [] as string[] };
      }
      return {
        success: result.success,
        message: result.success
          ? `Processed ${result.recordsProcessed} records, ${result.signalsGenerated} signals generated`
          : `Failed: ${result.errors.join(", ")}`,
        status: (result.success ? "completed" : "failed") as "completed" | "failed",
        recordsProcessed: result.recordsProcessed,
        recordsInserted: result.recordsInserted,
        recordsUpdated: result.recordsUpdated,
        signalsGenerated: result.signalsGenerated,
        errors: result.errors,
        runId: result.runId,
      };
    }),

  // Run ALL enabled streams — calls the same triggerManualIngestion for each
  runAllStreams: adminProcedure.mutation(async () => {
    const { dataStreamRegistry } = await import("../../drizzle/schema");
    const { db } = await import("../db");
    const { eq } = await import("drizzle-orm");
    const { triggerManualIngestion } = await import("../ingestion/scheduler");
    const streams = await db.select({ streamId: dataStreamRegistry.streamId, streamName: dataStreamRegistry.streamName })
      .from(dataStreamRegistry)
      .where(eq(dataStreamRegistry.enabled, true));
    const results: Array<{ streamId: string; streamName: string; success: boolean; message: string }> = [];
    for (const stream of streams) {
      try {
        const result = await Promise.race([
          triggerManualIngestion(stream.streamId),
          new Promise<null>((resolve) => setTimeout(() => resolve(null), 120_000)),
        ]);
        results.push({
          streamId: stream.streamId,
          streamName: stream.streamName ?? stream.streamId,
          success: result?.success ?? true,
          message: result
            ? (result.success ? `${result.recordsProcessed} records, ${result.signalsGenerated} signals` : result.errors.join(", "))
            : "Running in background",
        });
      } catch (err) {
        results.push({
          streamId: stream.streamId,
          streamName: stream.streamName ?? stream.streamId,
          success: false,
          message: err instanceof Error ? err.message : String(err),
        });
      }
    }
    return {
      totalStreams: streams.length,
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
      const uniqueStreams = [...new Set(failedRuns.map(r => r.datasetId))];
      const results: Array<{ streamId: string; success: boolean; message: string }> = [];
      for (const streamId of uniqueStreams) {
        try {
          const result = await Promise.race([
            triggerManualIngestion(streamId),
            new Promise<null>((resolve) => setTimeout(() => resolve(null), 120_000)),
          ]);
          results.push({
            streamId,
            success: result?.success ?? true,
            message: result
              ? (result.success ? `Retried: ${result.recordsProcessed} records` : result.errors.join(", "))
              : "Retry running in background",
          });
        } catch (err) {
          results.push({
            streamId,
            success: false,
            message: err instanceof Error ? err.message : String(err),
          });
        }
      }
      return {
        failedRunsFound: failedRuns.length,
        uniqueStreamsRetried: uniqueStreams.length,
        succeeded: results.filter(r => r.success).length,
        failed: results.filter(r => !r.success).length,
        results,
      };
    }),

  // Get stream execution status — pulls from ingestion_runs table (same data as Mission Control)
  getStreamStatus: adminProcedure
    .input(z.object({ streamId: z.string() }))
    .query(async ({ input }) => {
      const { ingestRuns, dataStreamRegistry } = await import("../../drizzle/schema");
      const { db } = await import("../db");
      const { eq, sql, desc } = await import("drizzle-orm");
      const { isDatasetRunning, isDatasetQueued } = await import("../ingestion/scheduler");
      // Get stream info
      const [stream] = await db.select().from(dataStreamRegistry).where(eq(dataStreamRegistry.streamId, input.streamId)).limit(1);
      // Get recent runs
      const recentRuns = await db.select()
        .from(ingestRuns)
        .where(eq(ingestRuns.datasetId, input.streamId))
        .orderBy(desc(ingestRuns.startTime))
        .limit(10);
      // Get aggregate stats
      const [stats] = await db.select({
        totalRuns: sql<number>`COUNT(*)`,
        successfulRuns: sql<number>`SUM(CASE WHEN ${ingestRuns.status} = 'completed' THEN 1 ELSE 0 END)`,
        failedRuns: sql<number>`SUM(CASE WHEN ${ingestRuns.status} = 'failed' THEN 1 ELSE 0 END)`,
        totalRecords: sql<number>`SUM(${ingestRuns.recordsProcessed})`,
        totalSignals: sql<number>`SUM(${ingestRuns.signalsGenerated})`,
      })
        .from(ingestRuns)
        .where(eq(ingestRuns.datasetId, input.streamId));
      return {
        stream: stream ?? null,
        isRunning: isDatasetRunning(input.streamId),
        isQueued: isDatasetQueued(input.streamId),
        recentRuns,
        stats: stats ?? { totalRuns: 0, successfulRuns: 0, failedRuns: 0, totalRecords: 0, totalSignals: 0 },
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
    .input(z.object({ streamId: z.string() }))
    .mutation(async ({ input }) => {
      const { reenableStream } = await import("../ingestion/scheduler");
      return reenableStream(input.streamId);
    }),

  // Reset failure counters for a stream
  resetFailureCounters: adminProcedure
    .input(z.object({ streamId: z.string() }))
    .mutation(async ({ input }) => {
      const { resetFailureCounters } = await import("../ingestion/scheduler");
      return resetFailureCounters(input.streamId);
    }),

  // Refresh all schedules (re-reads registry, reschedules all)
  refreshSchedules: adminProcedure.mutation(async () => {
    const { refreshSchedules } = await import("../ingestion/scheduler");
    await refreshSchedules();
    const { getSchedulerStatus } = await import("../ingestion/scheduler");
    return { success: true, ...getSchedulerStatus() };
  }),

  // Update stream configuration (apiUrl, cronExpression, fieldMapping, etc.)
  updateStreamConfig: adminProcedure
    .input(z.object({
      streamId: z.string(),
      apiUrl: z.string().optional(),
      cronExpression: z.string().optional(),
      // @ts-expect-error pre-existing type mismatch
      fieldMapping: z.record(z.string()).optional(),
      sourceUrl: z.string().optional(),
      parserMode: z.string().optional(),
      postProcessingEngineName: z.string().optional(),
      rationale: z.string().min(10).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { governedDataStreamConfigChange } = await import("../governance-hooks");
      const { streamId, rationale, ...updates } = input;
      const changes: Record<string, unknown> = {};
      if (updates.apiUrl !== undefined) changes.apiUrl = updates.apiUrl;
      if (updates.cronExpression !== undefined) changes.cronExpression = updates.cronExpression;
      if (updates.fieldMapping !== undefined) changes.fieldMapping = updates.fieldMapping;
      if (updates.sourceUrl !== undefined) changes.sourceUrl = updates.sourceUrl;
      if (updates.parserMode !== undefined) changes.parserMode = updates.parserMode;
      if (updates.postProcessingEngineName !== undefined) changes.postProcessingEngineName = updates.postProcessingEngineName;
      // GOVERNED: Data stream config change
      await governedDataStreamConfigChange({
        streamId,
        changes,
        rationale: rationale ?? `Stream configuration updated via sovereign control: ${Object.keys(changes).join(", ")}`,
        actorId: ctx.user.openId,
        actorRole: "admin",
      });
      // Refresh schedules if cron changed
      if (updates.cronExpression) {
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
      // @ts-expect-error pre-existing type mismatch
      return reorderEngines(input.orderedIds, ctx.user.id.toString(), ctx.user.name);
    }),

  // Update engine config
  updateEngineConfig: adminProcedure
    .input(z.object({
      engineId: z.string(),
      // @ts-expect-error pre-existing type mismatch
      config: z.record(z.any()).optional(),
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
        actorId: ctx.user.openId,
        actorRole: "admin",
      });
      return { success: true };
    }),

  // Get stream diagnostics (last run details with full diagnostics)
  getStreamDiagnostics: adminProcedure
    .input(z.object({ streamId: z.string() }))
    .query(async ({ input }) => {
      const { ingestRuns, dataStreamRegistry } = await import("../../drizzle/schema");
      const { db } = await import("../db");
      const { eq, desc } = await import("drizzle-orm");
      const [stream] = await db.select().from(dataStreamRegistry).where(eq(dataStreamRegistry.streamId, input.streamId)).limit(1);
      const [lastRun] = await db.select().from(ingestRuns).where(eq(ingestRuns.datasetId, input.streamId)).orderBy(desc(ingestRuns.startTime)).limit(1);
      return {
        stream: stream ? {
          streamId: stream.streamId,
          streamName: stream.streamName,
          lastRunStatus: stream.lastRunStatus,
          lastSuccessAt: stream.lastSuccessAt ? Number(stream.lastSuccessAt) : null,
          lastFailureAt: stream.lastFailureAt ? Number(stream.lastFailureAt) : null,
          lastErrorType: stream.lastErrorType,
          lastErrorMessage: stream.lastErrorMessage,
          lastHttpStatus: stream.lastHttpStatus,
          failureCount: stream.failureCount,
          consecutiveFailures: stream.consecutiveFailures,
          retryAfterAt: stream.retryAfterAt ? Number(stream.retryAfterAt) : null,
          autoDisabled: stream.autoDisabled,
          disabledReason: stream.disabledReason,
        } : null,
        lastRun: lastRun ? {
          id: lastRun.id,
          status: lastRun.status,
          startTime: Number(lastRun.startTime),
          endTime: lastRun.endTime ? Number(lastRun.endTime) : null,
          recordsProcessed: lastRun.recordsProcessed,
          signalsGenerated: lastRun.signalsGenerated,
          errorClassification: lastRun.errorClassification,
          httpStatus: lastRun.httpStatus,
          contentType: lastRun.contentType,
          endpointAttempted: lastRun.endpointAttempted,
          adapterUsed: lastRun.adapterUsed,
          bodyPreview: lastRun.bodyPreview,
          retryCount: lastRun.retryCount,
          failureClassification: lastRun.failureClassification,
          suggestedRemediation: lastRun.suggestedRemediation,
          outcomeClassification: lastRun.outcomeClassification,
          errors: lastRun.errors,
          summary: lastRun.summary,
        } : null,
      };
    }),

  // ─── Executor Service Endpoints (Session 81) ───

  // Reset stream checkpoint — clears lastIngestedAt for force re-ingestion
  resetCheckpoint: adminProcedure
    .input(z.object({ streamId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const { resetStreamCheckpoint } = await import("../engines/executor-service");
      // @ts-expect-error pre-existing type mismatch
      return resetStreamCheckpoint(input.streamId, ctx.user.id.toString(), ctx.user.name);
    }),

  // Force re-ingestion — reset checkpoint + immediately run
  forceReingestion: adminProcedure
    .input(z.object({ streamId: z.string(), maxRecords: z.number().optional() }))
    .mutation(async ({ ctx, input }) => {
      const { resetStreamCheckpoint } = await import("../engines/executor-service");
      // @ts-expect-error pre-existing type mismatch
      const resetResult = await resetStreamCheckpoint(input.streamId, ctx.user.id.toString(), ctx.user.name);
      if (!resetResult.success) return { ...resetResult, recordsProcessed: 0, signalsGenerated: 0 };
      // Now run the stream
      const { triggerManualIngestion } = await import("../ingestion/scheduler");
      const result = await Promise.race([
        triggerManualIngestion(input.streamId, input.maxRecords),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 120_000)),
      ]);
      if (!result) return { success: true, summary: "Checkpoint reset + ingestion started (running in background)", recordsProcessed: 0, signalsGenerated: 0 };
      return {
        success: result.success,
        summary: `Checkpoint reset + ${result.success ? `ingested ${result.recordsProcessed} records, ${result.signalsGenerated} signals` : `failed: ${result.errors.join(", ")}`}`,
        recordsProcessed: result.recordsProcessed,
        signalsGenerated: result.signalsGenerated,
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
        // @ts-expect-error pre-existing type mismatch
        configJson: z.record(z.any()).optional(),
        enabled: z.boolean().optional(),
        sortOrder: z.number().optional(),
      }),
    }))
    .mutation(async ({ ctx, input }) => {
      const { applyEnginePatch } = await import("../engines/executor-service");
      // @ts-expect-error pre-existing type mismatch
      return applyEnginePatch(input.engineId, input.updates, ctx.user.id.toString(), ctx.user.name);
    }),

  // Apply stream patch via executor service (with diff, impact analysis, rollback)
  applyStreamPatch: adminProcedure
    .input(z.object({
      streamId: z.string(),
      updates: z.object({
        streamName: z.string().optional(),
        apiUrl: z.string().optional(),
        sourceUrl: z.string().optional(),
        // @ts-expect-error pre-existing type mismatch
        fieldMapping: z.record(z.string()).optional(),
        cronExpression: z.string().optional(),
        signalWeight: z.number().optional(),
        confidenceMultiplier: z.number().optional(),
        enabled: z.boolean().optional(),
        postProcessingEngineName: z.string().optional(),
        parserMode: z.string().optional(),
      }),
    }))
    .mutation(async ({ ctx, input }) => {
      const { applyStreamPatch } = await import("../engines/executor-service");
      // @ts-expect-error pre-existing type mismatch
      const result = await applyStreamPatch(input.streamId, input.updates, ctx.user.id.toString(), ctx.user.name);
      // Refresh schedules if cron changed
      if (result.success && input.updates.cronExpression) {
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
      // @ts-expect-error pre-existing type mismatch
      return applySchemaPatch(input.sql, input.rollbackSql ?? null, input.description, ctx.user.id.toString(), ctx.user.name);
    }),

  // Rollback a patch by change log ID
  rollbackPatch: adminProcedure
    .input(z.object({ changeId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const { rollbackPatch } = await import("../engines/executor-service");
      // @ts-expect-error pre-existing type mismatch
      return rollbackPatch(input.changeId, ctx.user.id.toString(), ctx.user.name);
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
      streamId: z.string().optional(),
      status: z.enum(["running", "completed", "failed"]).optional(),
      limit: z.number().default(50),
    }).optional())
    .query(async ({ input }) => {
      const { ingestRuns } = await import("../../drizzle/schema");
      const { db } = await import("../db");
      const { eq, sql, desc, and } = await import("drizzle-orm");
      const conditions: any[] = [];
      if (input?.streamId) conditions.push(eq(ingestRuns.datasetId, input.streamId));
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
