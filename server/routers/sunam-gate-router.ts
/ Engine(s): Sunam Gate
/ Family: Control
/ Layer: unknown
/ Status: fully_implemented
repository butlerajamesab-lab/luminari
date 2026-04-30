/**
 * Sunam Gate Router — Sovereign Control Visibility
 * 
 * Admin-only procedures for:
 * - Viewing gate statistics (approved/rejected/staged)
 * - Managing threshold configurations
 * - Viewing staged signals (extraction_staging)
 * - Viewing gate decision log (sunam_gate_log)
 * - Manual promote/reject from staging
 */

import { z } from "zod";
import { router, adminProcedure } from "../_core/trpc";
import { db } from "../db";
import { sql } from "drizzle-orm";
import { manualPromote, manualReject, getGateStats, getStagedSignals, getThresholdConfig, updateThreshold, invalidateThresholdCache } from "../sunam-gate";

export const sunamGateRouter = router({
  // ─── Gate Statistics ───
  stats: adminProcedure.query(async () => {
    return getGateStats();
  }),

  // ─── Threshold Management ───
  listThresholds: adminProcedure.query(async () => {
    return getThresholdConfig();
  }),

  updateThreshold: adminProcedure
    .input(z.object({
      id: z.number(),
      weightConfidence: z.number().min(0).max(1).optional(),
      weightEvidenceStrength: z.number().min(0).max(1).optional(),
      weightCorroboration: z.number().min(0).max(1).optional(),
      weightTemporalDensity: z.number().min(0).max(1).optional(),
      weightGeographicScope: z.number().min(0).max(1).optional(),
      passThreshold: z.number().min(0).max(1).optional(),
      description: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...updates } = input;

      // Validate weights sum to ~1.0 if all provided
      if (updates.weightConfidence !== undefined &&
          updates.weightEvidenceStrength !== undefined &&
          updates.weightCorroboration !== undefined &&
          updates.weightTemporalDensity !== undefined &&
          updates.weightGeographicScope !== undefined) {
        const sum = updates.weightConfidence + updates.weightEvidenceStrength +
                    updates.weightCorroboration + updates.weightTemporalDensity +
                    updates.weightGeographicScope;
        if (Math.abs(sum - 1.0) > 0.01) {
          throw new Error(`Weights must sum to 1.0 (current sum: ${sum.toFixed(4)})`);
        }
      }

      return updateThreshold(id, updates, ctx.user.name ?? "admin");
    }),

  activateThreshold: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const now = Date.now();
      const actor = ctx.user.name ?? "admin";
      // Deactivate all
      await db.execute(sql`UPDATE sunam_thresholds SET is_active = 0, updated_at = ${now}`);
      // Activate the selected one
      await db.execute(sql`
        UPDATE sunam_thresholds 
        SET is_active = 1, updated_by = ${actor}, updated_at = ${now}
        WHERE id = ${input.id}
      `);
      invalidateThresholdCache();
      return { success: true };
    }),

  // ─── Staged Signals (extraction_staging) ───
  listStaged: adminProcedure
    .input(z.object({
      status: z.enum(["staged", "promoted", "rejected"]).optional(),
      datasetId: z.string().optional(),
      limit: z.number().min(1).max(200).default(50),
      offset: z.number().min(0).default(0),
    }))
    .query(async ({ input }) => {
      return getStagedSignals({
        limit: input.limit,
        offset: input.offset,
        datasetId: input.datasetId,
      });
    }),

  // ─── Manual Promote from Staging ───
  promoteFromStaging: adminProcedure
    .input(z.object({ stagingId: z.number(), reason: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const result = await manualPromote(input.stagingId, ctx.user.name ?? "admin");
      if (!result.success) {
        throw new Error(result.error ?? "Failed to promote signal");
      }
      return result;
    }),

  // ─── Manual Discard from Staging ───
  discardFromStaging: adminProcedure
    .input(z.object({ stagingId: z.number(), reason: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const result = await manualReject(input.stagingId, ctx.user.name ?? "admin", input.reason);
      if (!result.success) {
        throw new Error(result.error ?? "Failed to discard signal");
      }
      return result;
    }),

  // ─── Gate Decision Log ───
  listGateLog: adminProcedure
    .input(z.object({
      decision: z.enum(["approve", "reject", "manual_promote", "manual_reject"]).optional(),
      limit: z.number().min(1).max(200).default(50),
      offset: z.number().min(0).default(0),
    }))
    .query(async ({ input }) => {
      const decisionFilter = input.decision
        ? sql` WHERE decision = ${input.decision}`
        : sql``;

      const countRows = await db.execute(sql`
        SELECT COUNT(*) as cnt FROM sunam_gate_log ${decisionFilter}
      `);
      const total = Number((countRows as any)[0][0].cnt);

      const rows = await db.execute(sql`
        SELECT id, live_signal_id, signal_fingerprint, signal_type, dataset_id,
               sunam_score, threshold_used, score_breakdown,
               decision, decision_reason,
               promoted_signal_id, staging_id, actor,
               decided_at, created_at
        FROM sunam_gate_log
        ${decisionFilter}
        ORDER BY decided_at DESC
        LIMIT ${input.limit} OFFSET ${input.offset}
      `);

      return {
        items: (rows as any)[0].map((r: any) => ({
          id: r.id,
          liveSignalId: r.live_signal_id,
          signalFingerprint: r.signal_fingerprint,
          signalType: r.signal_type,
          datasetId: r.dataset_id,
          sunamScore: parseFloat(r.sunam_score),
          thresholdUsed: parseFloat(r.threshold_used),
          scoreBreakdown: typeof r.score_breakdown === "string"
            ? JSON.parse(r.score_breakdown)
            : r.score_breakdown,
          decision: r.decision,
          decisionReason: r.decision_reason,
          promotedSignalId: r.promoted_signal_id,
          stagingId: r.staging_id,
          actor: r.actor,
          decidedAt: Number(r.decided_at),
        })),
        total,
        limit: input.limit,
        offset: input.offset,
      };
    }),
});
