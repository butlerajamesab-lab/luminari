import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import {
  listTemplates,
  getTemplate,
  findMatchingTemplates,
  generateDocument,
  listGeneratedDocs,
  updateDocStatus,
  enqueueGeneration,
  processQueue,
  getQueueStatus,
  recordDocOutcome,
  getTemplateDashboard,
  getMissionControlRemedySummary,
} from "../remedy-template-service";
import { scanCaseEvidence } from "../evidence-mapping-service";
import { exportDocumentPDF, exportDocumentTXT } from "../document-export-service";

export const remedyTemplateRouter = router({
  // Dashboard summary
  dashboard: protectedProcedure.query(async () => {
    return getTemplateDashboard();
  }),

  // Mission Control summary
  missionControlSummary: protectedProcedure.query(async () => {
    return getMissionControlRemedySummary();
  }),

  // List templates with filters
  list: protectedProcedure
    .input(z.object({
      claimType: z.string().optional(),
      jurisdiction: z.string().optional(),
      templateType: z.string().optional(),
      difficultyLevel: z.string().optional(),
      search: z.string().optional(),
    }).optional())
    .query(async ({ input }) => {
      return listTemplates(input || undefined);
    }),

  // Get single template detail
  detail: protectedProcedure
    .input(z.object({ templateId: z.string() }))
    .query(async ({ input }) => {
      return getTemplate(input.templateId);
    }),

  // Find matching templates for a claim
  findMatching: protectedProcedure
    .input(z.object({
      claimType: z.string(),
      jurisdiction: z.string(),
      templateType: z.string().optional(),
    }))
    .query(async ({ input }) => {
      return findMatchingTemplates(input.claimType, input.jurisdiction, input.templateType);
    }),

  // Generate document from template
  generate: protectedProcedure
    .input(z.object({
      templateId: z.string(),
      placeholderValues: z.record(z.string(), z.string()),
      caseId: z.number().optional(),
      patternId: z.string().optional(),
      strategyPathId: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      return generateDocument(input.templateId, input.placeholderValues, {
        caseId: input.caseId,
        patternId: input.patternId,
        strategyPathId: input.strategyPathId,
        userId: ctx.user.id,
      });
    }),

  // List generated documents
  generatedDocs: protectedProcedure
    .input(z.object({
      caseId: z.number().optional(),
      patternId: z.string().optional(),
      strategyPathId: z.string().optional(),
      status: z.string().optional(),
      limit: z.number().optional(),
    }).optional())
    .query(async ({ input }) => {
      return listGeneratedDocs(input || undefined);
    }),

  // Update document status
  updateDocStatus: protectedProcedure
    .input(z.object({
      docId: z.string(),
      status: z.string(),
    }))
    .mutation(async ({ input }) => {
      await updateDocStatus(input.docId, input.status);
      return { success: true };
    }),

  // Enqueue document generation
  enqueue: protectedProcedure
    .input(z.object({
      caseId: z.number().optional(),
      patternId: z.string().optional(),
      templateId: z.string().optional(),
      strategyPathId: z.string().optional(),
      priority: z.number().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const queueId = await enqueueGeneration({ ...input, userId: ctx.user.id });
      return { queueId };
    }),

  // Process generation queue
  processQueue: protectedProcedure
    .input(z.object({ limit: z.number().optional() }).optional())
    .mutation(async ({ input }) => {
      return processQueue(input?.limit);
    }),

  // Get queue status
  queueStatus: protectedProcedure.query(async () => {
    return getQueueStatus();
  }),

  // Auto-fill from case evidence
  autoFill: protectedProcedure
    .input(z.object({
      caseId: z.number(),
      claimType: z.string(),
    }))
    .query(async ({ input }) => {
      return scanCaseEvidence(input.caseId, input.claimType);
    }),

  // Export document as PDF
  exportPDF: protectedProcedure
    .input(z.object({ docId: z.string() }))
    .mutation(async ({ input }) => {
      return exportDocumentPDF(input.docId);
    }),

  // Export document as TXT
  exportTXT: protectedProcedure
    .input(z.object({ docId: z.string() }))
    .mutation(async ({ input }) => {
      return exportDocumentTXT(input.docId);
    }),

  // Record document outcome
  recordOutcome: protectedProcedure
    .input(z.object({
      docId: z.string(),
      templateId: z.string(),
      caseId: z.number().optional(),
      outcomeStatus: z.string(),
      settlementAmount: z.number().optional(),
      responseReceived: z.boolean().optional(),
      daysToResolution: z.number().optional(),
      effectivenessScore: z.number().optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const trackingId = await recordDocOutcome(input);
      return { trackingId };
    }),
});
