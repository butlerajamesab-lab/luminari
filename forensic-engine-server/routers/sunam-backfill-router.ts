/**
 * Sunam Backfill Router
 * 
 * Admin-only tRPC procedures for Sunam autonomous backfill.
 */

import { router, adminProcedure } from "../_core/trpc.ts";
import { z } from "zod";
import {
  processSignalsBatch,
  getBackfillStatus,
} from "../sunam-backfill.ts";

export const sunamBackfillRouter = router({
  /**
   * Process a batch of unprocessed signals
   * 
   * Direct executor pathway — no NL replanning, no stream registration.
   */
  processSignalsBatch: adminProcedure
    .input(
      z.object({
        batchSize: z.number().min(1).max(1000).default(100),
      })
    )
    .mutation(async ({ input }) => {
      return await processSignalsBatch(input.batchSize);
    }),

  /**
   * Get backfill status and history
   */
  getStatus: adminProcedure.query(async () => {
    return await getBackfillStatus();
  }),
});
