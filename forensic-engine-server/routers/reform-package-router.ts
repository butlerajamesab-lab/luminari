import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import {
  generateReformPackage,
  exportReformPackage,
  updateReformPackageStatus,
  getReformPackageDashboard,
  getReformPackageDetail,
} from "../reform-package-export-service";
import {
  generateReformAction,
  getReformActionByPatternId,
  getAllReformPackagesSummary,
  getCoalitionIntelligence,
} from "../reform-pipeline";
import {
  snapshotPackageVersion,
  listPackageVersions,
  getPackageVersion,
  compareVersions,
  recordExport,
  listExportHistory,
  getExportStats,
  recordReformAction,
  updateActionOutcome,
  listPackageStrategyMemory,
  getStrategyEffectivenessSummary,
  regenerateReformPackage,
  exportWithLogging,
} from "../reform-package-enhanced-service";

export const reformPackageRouter = router({
  // ── Core CRUD ──────────────────────────────────────────────────────

  generate: protectedProcedure
    .input(z.object({ patternId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const pkg = await generateReformPackage(input.patternId);
      // Record in strategy memory
      await recordReformAction({
        patternId: input.patternId,
        reformPackageId: pkg.packageId,
        actionType: "generate_package",
        actionData: { version: 1 },
        userId: ctx.user.id.toString(),
      });
      return pkg;
    }),

  detail: protectedProcedure
    .input(z.object({ packageId: z.string() }))
    .query(async ({ input }) => {
      return getReformPackageDetail(input.packageId);
    }),

  dashboard: protectedProcedure.query(async () => {
    return getReformPackageDashboard();
  }),

  updateStatus: protectedProcedure
    .input(z.object({
      packageId: z.string(),
      newStatus: z.enum(["draft", "review", "submitted", "under_consideration", "adopted", "rejected"]),
      submittedTo: z.string().optional(),
      signalReductionPct: z.number().optional(),
      systemicImpactScore: z.number().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      // Snapshot before status change
      await snapshotPackageVersion(input.packageId, `Status change to ${input.newStatus}`, ctx.user.id.toString());
      await updateReformPackageStatus(input.packageId, input.newStatus, {
        submittedTo: input.submittedTo,
        signalReductionPct: input.signalReductionPct,
        systemicImpactScore: input.systemicImpactScore,
      });
      return { success: true };
    }),

  // ── Export ─────────────────────────────────────────────────────────

  export: protectedProcedure
    .input(z.object({
      packageId: z.string(),
      format: z.enum(["markdown", "html", "json"]),
    }))
    .query(async ({ input, ctx }) => {
      return exportWithLogging(input.packageId, input.format, ctx.user.id.toString());
    }),

  exportHistory: protectedProcedure
    .input(z.object({ packageId: z.string() }))
    .query(async ({ input }) => {
      return listExportHistory(input.packageId);
    }),

  exportStats: protectedProcedure
    .input(z.object({ packageId: z.string() }))
    .query(async ({ input }) => {
      return getExportStats(input.packageId);
    }),

  // ── Version Tracking ───────────────────────────────────────────────

  versions: protectedProcedure
    .input(z.object({ packageId: z.string() }))
    .query(async ({ input }) => {
      return listPackageVersions(input.packageId);
    }),

  versionDetail: protectedProcedure
    .input(z.object({ packageId: z.string(), versionNumber: z.number() }))
    .query(async ({ input }) => {
      return getPackageVersion(input.packageId, input.versionNumber);
    }),

  compareVersions: protectedProcedure
    .input(z.object({
      packageId: z.string(),
      versionA: z.number(),
      versionB: z.number(),
    }))
    .query(async ({ input }) => {
      return compareVersions(input.packageId, input.versionA, input.versionB);
    }),

  regenerate: protectedProcedure
    .input(z.object({ packageId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      return regenerateReformPackage(input.packageId, ctx.user.id.toString());
    }),

  // ── Strategy Memory ────────────────────────────────────────────────

  strategyMemory: protectedProcedure
    .input(z.object({ packageId: z.string() }))
    .query(async ({ input }) => {
      return listPackageStrategyMemory(input.packageId);
    }),

  strategyEffectiveness: protectedProcedure
    .input(z.object({ patternId: z.string() }))
    .query(async ({ input }) => {
      return getStrategyEffectivenessSummary(input.patternId);
    }),

  recordAction: protectedProcedure
    .input(z.object({
      patternId: z.string(),
      reformPackageId: z.string(),
      actionType: z.string(),
      actionData: z.any().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      return recordReformAction({
        patternId: input.patternId,
        reformPackageId: input.reformPackageId,
        actionType: input.actionType,
        actionData: input.actionData,
        userId: ctx.user.id.toString(),
      });
    }),

  updateOutcome: protectedProcedure
    .input(z.object({
      actionId: z.number(),
      outcomeFeedback: z.string(),
      effectivenessScore: z.number().min(0).max(100),
    }))
    .mutation(async ({ input }) => {
      await updateActionOutcome(input.actionId, input.outcomeFeedback, input.effectivenessScore);
      return { success: true };
    }),

  // ── Reform Pipeline (Lumina spec) ──────────────────────────────────
  pipelineAction: protectedProcedure
    .input(z.object({
      domain: z.string(),
      patternId: z.string().optional(),
      signalCount: z.number().optional(),
      failureRate: z.number().min(0).max(1).optional(),
      geographicSpread: z.number().min(0).max(57).optional(),
      recurrenceCount: z.number().optional(),
    }))
    .query(async ({ input }) => {
      return generateReformAction({
        domain: input.domain,
        patternId: input.patternId,
        signalCount: input.signalCount,
        failureRate: input.failureRate,
        geographicSpread: input.geographicSpread,
        recurrenceCount: input.recurrenceCount,
      });
    }),

  pipelineByPattern: protectedProcedure
    .input(z.object({ patternId: z.string() }))
    .query(async ({ input }) => {
      return getReformActionByPatternId(input.patternId);
    }),

  allPackagesSummary: protectedProcedure.query(async () => {
    return getAllReformPackagesSummary();
  }),

  coalitionIntelligence: protectedProcedure
    .input(z.object({ domain: z.string() }))
    .query(async ({ input }) => {
      return getCoalitionIntelligence(input.domain);
    }),
});
