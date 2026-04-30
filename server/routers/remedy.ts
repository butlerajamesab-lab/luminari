import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { runAction, runRead } from "../lib/constitutional-enforce";

export const remedyRouter = router({
  generate: protectedProcedure
    .input(z.object({ caseId: z.number() }))
    .mutation(async ({ input }) => {
      return await runAction(input.caseId, "generateRemedyPaths", input);
    }),

  list: protectedProcedure
    .input(z.object({ caseId: z.number() }))
    .query(async ({ input }) => {
      return await runRead(input.caseId);
    }),

  updateStep: protectedProcedure
    .input(z.object({
      stepId: z.number(),
      status: z.enum(["pending", "in_progress", "completed", "skipped", "blocked"]),
      caseId: z.number(),
    }))
    .mutation(async ({ input }) => {
      return await runAction(input.caseId, "updateStepStatus", input);
    }),

  fulfillDoc: protectedProcedure
    .input(z.object({
      reqId: z.number(),
      docId: z.number().nullable(),
      caseId: z.number(),
    }))
    .mutation(async ({ input }) => {
      return await runAction(input.caseId, "fulfillDocRequirement", input);
    }),

  updatePathStatus: protectedProcedure
    .input(z.object({
      pathId: z.number(),
      status: z.string(),
      caseId: z.number(),
    }))
    .mutation(async ({ input }) => {
      return await runAction(input.caseId, "updateRemedyPathStatus", input);
    }),

  getRemedy: protectedProcedure
    .input(z.object({ caseId: z.number() }))
    .query(async ({ input }) => {
      return await runRead(input.caseId);
    }),

  matchRemedy: protectedProcedure
    .input(z.object({ caseId: z.number() }))
    .query(async ({ input }) => {
      return await runRead(input.caseId);
    }),

  calculateRemedyViability: protectedProcedure
    .input(z.object({ caseId: z.number() }))
    .query(async ({ input }) => {
      return await runRead(input.caseId);
    }),

  recommendRemedy: protectedProcedure
    .input(z.object({ caseId: z.number() }))
    .query(async ({ input }) => {
      return await runRead(input.caseId);
    }),
});



// ============================================================
