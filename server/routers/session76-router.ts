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

// ─── Ingestion Control ───
const ingestionControlRouter = router({
  list_corpus_import_queue: adminProcedure
    .input(z.object({
      status_filter: z.enum([
        "all",
        "blocked",
        "review_required",
        "pending_bucket_content_scan",
        "pending_docx_normalization",
        "docx_extraction_failed",
        "candidates_created",
      ]).default("all"),
      limit: z.number().min(1).max(500).default(100),
    }).optional())
    .query(async ({ input }) => {
      const { list_corpus_import_queue } = await import("../engines/ingestion-control");
      return list_corpus_import_queue(input);
    }),

  get_corpus_import_queue_row: adminProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .query(async ({ input }) => {
      const { get_corpus_import_queue_row } = await import("../engines/ingestion-control");
      return get_corpus_import_queue_row(input);
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
