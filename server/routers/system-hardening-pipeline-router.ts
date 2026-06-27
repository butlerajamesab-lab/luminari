import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import {
  executePipeline,
  savePipelineResult,
  getPipelineHistory,
  getPipelineDetail,
  getPipelineDashboard,
} from "../system-hardening-pipeline-service";

const resourceProfileSchema = z.object({
  budget: z.number(),
  timeAvailableDays: z.number(),
  hasAttorney: z.boolean(),
  prerequisitesMet: z.array(z.string()),
});

const evidenceItemSchema = z.object({
  type: z.string(),
  description: z.string().optional(),
  source: z.string().optional(),
  has_contradictions: z.boolean().optional(),
  corroborated: z.boolean().optional(),
});

export const systemHardeningPipelineRouter = router({
  // Execute full pipeline
  execute: protectedProcedure
    .input(z.object({
      caseId: z.string(),
      claimType: z.string(),
      jurisdiction: z.string(),
      strategyType: z.string(),
      evidence: z.array(evidenceItemSchema),
      resources: resourceProfileSchema,
    }))
    .mutation(async ({ input }) => {
      const result = await executePipeline(input);
      return result;
    }),

  // Execute and save pipeline result
  executeAndSave: protectedProcedure
    .input(z.object({
      caseId: z.string(),
      claimType: z.string(),
      jurisdiction: z.string(),
      strategyType: z.string(),
      evidence: z.array(evidenceItemSchema),
      resources: resourceProfileSchema,
    }))
    .mutation(async ({ input }) => {
      const result = await executePipeline(input);
      const id = await savePipelineResult(result);
      return { id, result };
    }),

  // Get pipeline history for a case
  history: protectedProcedure
    .input(z.object({ caseId: z.string() }))
    .query(async ({ input }) => {
      return getPipelineHistory(input.caseId);
    }),

  // Get pipeline detail by ID
  detail: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      return getPipelineDetail(input.id);
    }),

  // Dashboard
  dashboard: protectedProcedure.query(async () => {
    return getPipelineDashboard();
  }),

  // Mission Control summary
  missionControlSummary: protectedProcedure.query(async () => {
    const dashboard = await getPipelineDashboard();
    return {
      total_runs: dashboard.totalRuns,
      avg_confidence_score: dashboard.avgConfidenceScore,
      verdict_distribution: dashboard.verdictDistribution,
      recent_runs: dashboard.recentRuns,
    };
  }),
});
