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