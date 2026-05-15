import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { runAction, runRead } from "../lib/constitutional-enforce";

const resourceProfileSchema = z.object({
  budget: z.number(),
  timeAvailableDays: z.number(),
  hasAttorney: z.boolean(),
  prerequisitesMet: z.array(z.string()),
});

export const remedyFeasibilityRouter = router({
  assess: protectedProcedure
    .input(z.object({
      strategyType: z.string(),
      evidenceScore: z.number(),
      resources: resourceProfileSchema,
      caseId: z.number(),
    }))
    .mutation(async ({ input }) => {
      return await runAction(input.caseId, "assessRemedyFeasibility", input);
    }),

  compare: protectedProcedure
    .input(z.object({
      strategyTypes: z.array(z.string()),
      evidenceScore: z.number(),
      resources: resourceProfileSchema,
      caseId: z.number(),
    }))
    .mutation(async ({ input }) => {
      return await runAction(input.caseId, "compareRemedyOptions", input);
    }),

  saveResult: protectedProcedure
    .input(z.object({
      caseId: z.number(),
      strategyType: z.string(),
      evidenceScore: z.number(),
      resources: resourceProfileSchema,
    }))
    .mutation(async ({ input }) => {
      return await runAction(input.caseId, "saveAssessmentResult", input);
    }),

  dashboard: protectedProcedure
    .input(z.object({ caseId: z.number() }))
    .query(async ({ input }) => {
      return await runRead(input.caseId);
    }),

  availableStrategies: protectedProcedure
    .query(async () => {
      return { message: "Available strategies through interpretation-service" };
    }),

  strategyDetail: protectedProcedure
    .input(z.object({ strategyId: z.string(), caseId: z.number() }))
    .query(async ({ input }) => {
      return await runRead(input.caseId);
    }),

  getRiskFactors: protectedProcedure
    .input(z.object({ caseId: z.number() }))
    .query(async ({ input }) => {
      return await runRead(input.caseId);
    }),

  calculateSuccessProbability: protectedProcedure
    .input(z.object({ caseId: z.number() }))
    .query(async ({ input }) => {
      return await runRead(input.caseId);
    }),

  compareFeasibility: protectedProcedure
    .input(z.object({ caseId: z.number() }))
    .query(async ({ input }) => {
      return await runRead(input.caseId);
    }),
});
