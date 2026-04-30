import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { runAction, runRead } from "../lib/constitutional-enforce";

export const settlementCalculatorRouter = router({
  dashboard: protectedProcedure
    .input(z.object({ caseId: z.number().optional() }))
    .query(async ({ input }) => {
      if (input?.caseId) {
        return await runRead(input.caseId);
      }
      return { message: "Dashboard available through interpretation-service" };
    }),

  calculate: protectedProcedure
    .input(z.object({
      claimType: z.string(),
      jurisdiction: z.string(),
      formulaId: z.string().optional(),
      variables: z.record(z.string(), z.number()),
      caseId: z.number().optional(),
      patternId: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const caseId = input.caseId || 0;
      return await runAction(caseId, "calculateSettlement", input);
    }),

  formulas: protectedProcedure
    .input(z.object({
      claimType: z.string().optional(),
      jurisdiction: z.string().optional(),
    }).optional())
    .query(async ({ input }) => {
      return { message: "Formulas available through interpretation-service" };
    }),

  history: protectedProcedure
    .input(z.object({
      caseId: z.number().optional(),
      patternId: z.string().optional(),
      limit: z.number().optional(),
    }).optional())
    .query(async ({ input }) => {
      if (input?.caseId) {
        return await runRead(input.caseId);
      }
      return { message: "History available through interpretation-service" };
    }),

  jurisdictionRules: protectedProcedure
    .input(z.object({ jurisdiction: z.string(), caseId: z.number().optional() }))
    .query(async ({ input }) => {
      if (input.caseId) {
        return await runRead(input.caseId);
      }
      return { message: "Jurisdiction rules available through interpretation-service" };
    }),

  compareFormulas: protectedProcedure
    .input(z.object({ caseId: z.number() }))
    .query(async ({ input }) => {
      return await runRead(input.caseId);
    }),

  estimateDamages: protectedProcedure
    .input(z.object({ caseId: z.number() }))
    .query(async ({ input }) => {
      return await runRead(input.caseId);
    }),

  compareSettlements: protectedProcedure
    .input(z.object({ caseId: z.number() }))
    .query(async ({ input }) => {
      return await runRead(input.caseId);
    }),

  getSettlementHistory: protectedProcedure
    .input(z.object({ caseId: z.number() }))
    .query(async ({ input }) => {
      return await runRead(input.caseId);
    }),
});
