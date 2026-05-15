/**
 * NYC Housing Router
 * Endpoint to trigger REAL NYC housing violations data ingestion
 */

import { router, publicProcedure } from "../_core/trpc";
import { runNycHousingStream } from "../services/nyc-housing-stream";
import { z } from "zod";

export const nycHousingRouter = router({
  /**
   * Trigger NYC Housing violations stream
   */
  trigger: publicProcedure
    .input(z.object({ limit: z.number().default(100) }).optional())
    .mutation(async ({ input }) => {
      const result = await runNycHousingStream({ limit: input?.limit ?? 100 });
      return {
        success: result.errors.length === 0,
        ...result,
      };
    }),
});
