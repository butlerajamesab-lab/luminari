import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { runAction, runRead } from "../lib/constitutional-enforce";

export const submissionWorkflowRouter = router({
  createDraft: protectedProcedure
    .input(z.object({
      endpointId: z.string(),
      patternId: z.string().optional(),
      strategyId: z.string().optional(),
      pathId: z.string().optional(),
      caseId: z.number().optional(),
      actionType: z.string(),
      actionDescription: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const caseId = input.caseId || 0;
      return await runAction(caseId, "createDraftSubmission", input);
    }),

  attachEvidence: protectedProcedure
    .input(z.object({
      submissionId: z.string(),
      caseId: z.number().optional(),
      patternId: z.string().optional(),
      additionalEvidence: z.array(z.object({
        title: z.string(),
        type: z.string(),
        reference: z.string(),
      })).optional(),
    }))
    .mutation(async ({ input }) => {
      const caseId = input.caseId || 0;
      return await runAction(caseId, "attachEvidence", input);
    }),

  generatePackage: protectedProcedure
    .input(z.object({
      submissionId: z.string(),
      caseId: z.number().optional(),
      pathId: z.string().optional(),
      patternId: z.string().optional(),
      strategyId: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const caseId = input.caseId || 0;
      return await runAction(caseId, "generateSubmissionPackage", input);
    }),

  confirmSubmission: protectedProcedure
    .input(z.object({
      submissionId: z.string(),
      caseId: z.number().optional(),
    }))
    .mutation(async ({ input }) => {
      const caseId = input.caseId || 0;
      return await runAction(caseId, "confirmSubmission", input);
    }),

  transitionStatus: protectedProcedure
    .input(z.object({
      submissionId: z.string(),
      newStatus: z.string(),
      caseId: z.number().optional(),
    }))
    .mutation(async ({ input }) => {
      const caseId = input.caseId || 0;
      return await runAction(caseId, "transitionSubmissionStatus", input);
    }),

  getWorkflowState: protectedProcedure
    .input(z.object({
      submissionId: z.string(),
      caseId: z.number(),
    }))
    .query(async ({ input }) => {
      return await runRead(input.caseId);
    }),

  listActiveWorkflows: protectedProcedure
    .input(z.object({ caseId: z.number() }))
    .query(async ({ input }) => {
      return await runRead(input.caseId);
    }),

  getWorkflowSummary: protectedProcedure
    .input(z.object({ caseId: z.number() }))
    .query(async ({ input }) => {
      return await runRead(input.caseId);
    }),
});
