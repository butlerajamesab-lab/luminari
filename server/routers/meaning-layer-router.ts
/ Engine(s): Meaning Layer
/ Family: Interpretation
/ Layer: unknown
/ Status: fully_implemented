/**
 * Meaning Layer Router
 * 
 * Public procedures for accessing signal/case context and impact analysis.
 */

import { router, publicProcedure } from "../_core/trpc.ts";
import { z } from "zod";
import {
  getSignalContext,
  getCaseContext,
  getSignalImpactAnalysis,
  getCaseHealth,
} from "../meaning-layer-service.ts";

export const meaningLayerRouter = router({
  /**
   * Get full context for a signal
   * Shows which cases depend on it and what governance affects it
   */
  getSignalContext: publicProcedure
    .input(z.object({ signalId: z.number() }))
    .query(async ({ input }) => {
      return await getSignalContext(input.signalId);
    }),

  /**
   * Get full context for a case
   * Shows which signals it depends on and what governance affects it
   */
  getCaseContext: publicProcedure
    .input(z.object({ caseId: z.number() }))
    .query(async ({ input }) => {
      return await getCaseContext(input.caseId);
    }),

  /**
   * Get impact analysis: what happens if we disable this signal?
   */
  getSignalImpactAnalysis: publicProcedure
    .input(z.object({ signalId: z.number() }))
    .query(async ({ input }) => {
      return await getSignalImpactAnalysis(input.signalId);
    }),

  /**
   * Get case health: are all dependent signals active?
   */
  getCaseHealth: publicProcedure
    .input(z.object({ caseId: z.number() }))
    .query(async ({ input }) => {
      return await getCaseHealth(input.caseId);
    }),
});
