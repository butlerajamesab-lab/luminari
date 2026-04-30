import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { runAction, runRead } from "../lib/constitutional-enforce";

export const paperworkRouter = router({
  templates: protectedProcedure
    .input(z.object({ type: z.string().optional() }).optional())
    .query(async ({ input }) => {
      return { message: "Templates available through interpretation-service" };
    }),

  generate: protectedProcedure
    .input(z.object({
      caseId: z.number(),
      templateId: z.number().optional(),
      documentType: z.string(),
      recipientName: z.string().optional(),
      recipientAddress: z.string().optional(),
      customInstructions: z.string().optional(),
      remedyStepId: z.number().optional(),
    }))
    .mutation(async ({ input }) => {
      return await runAction(input.caseId, "generateDocument", input);
    }),

  list: protectedProcedure
    .input(z.object({ caseId: z.number() }))
    .query(async ({ input }) => {
      return await runRead(input.caseId);
    }),

  get: protectedProcedure
    .input(z.object({ docId: z.number(), caseId: z.number() }))
    .query(async ({ input }) => {
      return await runRead(input.caseId);
    }),

  update: protectedProcedure
    .input(z.object({
      docId: z.number(),
      caseId: z.number(),
      content: z.string().optional(),
      status: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      return await runAction(input.caseId, "updateGeneratedDoc", input);
    }),

  populateForm: protectedProcedure
    .input(z.object({ caseId: z.number(), formId: z.number() }))
    .mutation(async ({ input }) => {
      return await runAction(input.caseId, "populateForm", input);
    }),

  validateForm: protectedProcedure
    .input(z.object({ caseId: z.number(), formId: z.number() }))
    .query(async ({ input }) => {
      return await runRead(input.caseId);
    }),

  submitForm: protectedProcedure
    .input(z.object({ caseId: z.number(), formId: z.number() }))
    .mutation(async ({ input }) => {
      return await runAction(input.caseId, "submitForm", input);
    }),
});



// ============================================================
