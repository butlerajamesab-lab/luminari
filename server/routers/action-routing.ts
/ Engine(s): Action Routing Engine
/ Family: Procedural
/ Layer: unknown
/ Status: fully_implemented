import { router, publicProcedure, protectedProcedure } from "../_core/trpc";
import { z } from "zod";
import { runRead, runAction } from "../lib/constitutional-enforce";

/**
 * Action Routing Engine
 * Converts lens activation into deterministic, traceable actions
 * No inference. No mutation of source data.
 */

export const actionRoutingRouter = router({
  /**
   * Route actions based on active lenses
   * Deterministic: same input → same output
   * Idempotent: no duplicate actions
   */
  routeActionsFromLenses: protectedProcedure
    .input(
      z.object({
        caseId: z.string(),
        signalId: z.string().optional(),
        activeLenses: z.object({
          user: z.boolean().default(false),
          professional: z.boolean().default(false),
          systemic: z.boolean().default(false),
          advocate: z.boolean().default(false),
          admin: z.boolean().default(false),
        }),
      })
    )
    .mutation(async ({ input }) => {
      return await runAction(input.caseId, "routeActionsFromLenses", input);
    }),

  /**
   * Get pending actions for a case
   */
  getPendingActions: protectedProcedure
    .input(z.object({ caseId: z.string() }))
    .query(async ({ input }) => {
      return await runRead(input.caseId);
    }),

  /**
   * Update action status (pending → in_progress → completed/failed)
   */
  updateActionStatus: protectedProcedure
    .input(
      z.object({
        actionId: z.string(),
        status: z.enum(["pending", "in_progress", "completed", "failed"]),
        failureReason: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      return await runAction(input.actionId, "updateActionStatus", input);
    }),

  /**
   * Get action queue statistics
   */
  getActionQueueStats: protectedProcedure.query(async () => {
    return { message: "Action queue stats available through interpretation-service" };
  }),
});
