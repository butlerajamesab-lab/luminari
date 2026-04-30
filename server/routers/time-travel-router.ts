/**
 * Time-Travel Analysis Router (Session 71)
 *
 * tRPC endpoints for historical replay, counterfactual analysis,
 * algorithm comparison, earliest detection, and report generation.
 */
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import {
  createSnapshot,
  listSnapshots,
  getSnapshot,
  runHistoricalReplay,
  runCounterfactualReplay,
  compareAlgorithmVersions,
  detectEarliestPatternDate,
  generateReplayReport,
  listRuns,
  getRun,
  getRunStats,
  getAlgorithmVersions,
} from "../engines/time-travel-engine";

export const timeTravelRouter = router({
  // ── Algorithm Versions ───────────────────────────────────────────
  algorithmVersions: protectedProcedure
    .query(() => getAlgorithmVersions()),

  // ── Snapshots ────────────────────────────────────────────────────
  createSnapshot: protectedProcedure
    .input(z.object({
      sourceTable: z.enum(["ingested_records", "detected_signals", "pattern_registry"]),
      dateRange: z.object({
        from: z.number(),
        to: z.number(),
      }).optional(),
    }))
    .mutation(async ({ input, ctx }) =>
      createSnapshot(input.sourceTable, input.dateRange, ctx.user.id)
    ),

  listSnapshots: protectedProcedure
    .input(z.object({ limit: z.number().optional() }).optional())
    .query(async ({ input }) => listSnapshots(input?.limit)),

  getSnapshot: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => getSnapshot(input.id)),

  // ── Historical Replay ────────────────────────────────────────────
  runHistoricalReplay: protectedProcedure
    .input(z.object({
      snapshotId: z.number().optional(),
      algorithmVersion: z.string(),
      startDate: z.number().optional(),
      endDate: z.number().optional(),
      datasetIds: z.array(z.string()).optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) =>
      runHistoricalReplay({ ...input, createdBy: ctx.user.id })
    ),

  // ── Counterfactual Replay ────────────────────────────────────────
  runCounterfactualReplay: protectedProcedure
    .input(z.object({
      snapshotId: z.number().optional(),
      algorithmVersion: z.string(),
      startDate: z.number().optional(),
      endDate: z.number().optional(),
      datasetIds: z.array(z.string()).optional(),
      notes: z.string().optional(),
      parameters: z.array(z.object({
        name: z.string(),
        value: z.string(),
        type: z.enum(["weight_override", "filter_toggle", "threshold_change", "stream_inclusion", "date_shift", "entity_filter"]),
        description: z.string().optional(),
      })),
    }))
    .mutation(async ({ input, ctx }) =>
      runCounterfactualReplay({ ...input, createdBy: ctx.user.id })
    ),

  // ── Algorithm Comparison ─────────────────────────────────────────
  compareAlgorithms: protectedProcedure
    .input(z.object({
      versionA: z.string(),
      versionB: z.string(),
      startDate: z.number().optional(),
      endDate: z.number().optional(),
      datasetIds: z.array(z.string()).optional(),
    }))
    .mutation(async ({ input, ctx }) =>
      compareAlgorithmVersions(input.versionA, input.versionB, {
        startDate: input.startDate,
        endDate: input.endDate,
        datasetIds: input.datasetIds,
        createdBy: ctx.user.id,
      })
    ),

  // ── Earliest Detection ───────────────────────────────────────────
  detectEarliest: protectedProcedure
    .input(z.object({
      patternType: z.string(),
      entityName: z.string().optional(),
      algorithmVersion: z.string().optional(),
    }))
    .mutation(async ({ input }) =>
      detectEarliestPatternDate(input.patternType, input.entityName, input.algorithmVersion)
    ),

  // ── Report Generation ────────────────────────────────────────────
  generateReport: protectedProcedure
    .input(z.object({ runId: z.number() }))
    .query(async ({ input }) => generateReplayReport(input.runId)),

  // ── Run Management ───────────────────────────────────────────────
  listRuns: protectedProcedure
    .input(z.object({ limit: z.number().optional() }).optional())
    .query(async ({ input }) => listRuns(input?.limit)),

  getRun: protectedProcedure
    .input(z.object({ runId: z.number() }))
    .query(async ({ input }) => getRun(input.runId)),

  getStats: protectedProcedure
    .query(() => getRunStats()),
});



// ============================================================
