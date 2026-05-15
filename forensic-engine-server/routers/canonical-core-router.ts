/**
 * Canonical Core Router — tRPC endpoints for the knowledge core
 *
 * Provides:
 * - canonicalCore.health → Full table-level health check
 * - canonicalCore.summary → High-level system summary counts
 * - canonicalCore.pipelineState → Pipeline execution history
 * - canonicalCore.finalize → Manual finalization trigger (admin only)
 */

import { z } from "zod";
import { router, publicProcedure, protectedProcedure } from "../_core/trpc";
import {
  getCanonicalCoreHealth,
  getPipelineCompletionState,
  finalizePipelineRun,
} from "../services/canonical-core";
import { getSystemSummary } from "../services/unified-access";
import { reconnectAllSectors } from "../services/knowledge-reconnect";

export const canonicalCoreRouter = router({
  /**
   * health — Returns row counts for all canonical tables
   * Used by Mission Control to reflect true system state
   */
  health: publicProcedure.query(async () => {
    return getCanonicalCoreHealth();
  }),

  /**
   * summary — Returns high-level system summary counts
   * Used by Mission Control dashboard cards
   */
  summary: publicProcedure.query(async () => {
    return getSystemSummary();
  }),

  /**
   * pipelineState — Returns pipeline execution history
   * Used by Pipeline Analytics and Mission Control
   */
  pipelineState: publicProcedure.query(async () => {
    return getPipelineCompletionState();
  }),

  /**
   * finalize — Manual pipeline finalization (admin only)
   * Allows admin to record a pipeline completion event
   */
  finalize: protectedProcedure
    .input(
      z.object({
        pipelineSource: z.string(),
        description: z.string(),
        canonicalTables: z.array(z.string()),
        recordsWritten: z.number(),
        errors: z.array(z.string()).optional(),
      })
    )
    .mutation(async ({ input }) => {
      return finalizePipelineRun({
        pipelineSource: input.pipelineSource as any,
        description: input.description,
        canonicalTables: input.canonicalTables,
        recordsWritten: input.recordsWritten,
        errors: input.errors,
      });
    }),

  /**
   * reconnect — Populate empty knowledge sectors from canonical registry data
   * Section 9: Reconnects empty tables by deriving data from populated ones
   */
  reconnect: protectedProcedure.mutation(async () => {
    return reconnectAllSectors();
  }),
});
