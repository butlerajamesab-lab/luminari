/**
 * Canonical Core Router — current Lighthouse truth surface.
 *
 * Mission Control must read the current reconciled civic-object universe,
 * not legacy registry tables or manual world-node bookkeeping.
 */

import { z } from "zod";
import { router, publicProcedure, protectedProcedure } from "../_core/trpc";
import {
  getPipelineCompletionState,
  finalizePipelineRun,
} from "../services/canonical-core";
import {
  getCurrentCanonicalCoreHealth,
  getCurrentCanonicalState,
  getCurrentGraphNodes,
  getCurrentSystemSummary,
} from "../services/current-canonical-state";
import { reconnectAllSectors } from "../services/knowledge-reconnect";

export const canonicalCoreRouter = router({
  health: publicProcedure.query(async () => {
    return getCurrentCanonicalCoreHealth();
  }),

  summary: publicProcedure.query(async () => {
    return getCurrentSystemSummary();
  }),

  currentState: publicProcedure.query(async () => {
    return getCurrentCanonicalState();
  }),

  graphNodes: publicProcedure
    .input(z.object({
      limit: z.number().int().min(1).max(200).default(20),
      nodeType: z.string().trim().max(80).optional(),
    }).optional())
    .query(async ({ input }) => {
      return getCurrentGraphNodes(input ?? {});
    }),

  pipelineState: publicProcedure.query(async () => {
    return getPipelineCompletionState();
  }),

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

  reconnect: protectedProcedure.mutation(async () => {
    return reconnectAllSectors();
  }),
});
