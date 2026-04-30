import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { runRead } from "../lib/constitutional-enforce";

export const unifiedOutputRouter = router({
  getCaseUnifiedNodes: protectedProcedure
    .input(z.object({ caseId: z.number() }))
    .query(async ({ input }) => {
      return await runRead(input.caseId);
    }),

  getCaseSummary: protectedProcedure
    .input(z.object({ caseId: z.number() }))
    .query(async ({ input }) => {
      return await runRead(input.caseId);
    }),

  generateCaseBundle: protectedProcedure
    .input(z.object({ caseId: z.number() }))
    .query(async ({ input }) => {
      return await runRead(input.caseId);
    }),

  exportCaseBundle: protectedProcedure
    .input(z.object({ caseId: z.number(), format: z.enum(['pdf', 'json', 'html']) }))
    .mutation(async ({ input }) => {
      return { message: "Export through interpretation-service" };
    }),
});



// ============================================================
