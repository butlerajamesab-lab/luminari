/**
 * Outcome & Feedback Engine — tRPC Router
 */
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import {
  recordOutcome,
  updateOutcomeMetrics,
  recordOutcomeMetric,
  feedbackLoop,
  getOutcomeDashboard,
  getEffectivenessReport,
  getMissionControlOutcomeSummary,
} from "../outcome-engine";
import { withEngineTracking, ENGINE_IDS } from "../engine-entrypoint-wrapper";

export const outcomeEngineRouter = router({
  /** Dashboard: list all outcomes with summary stats */
  dashboard: protectedProcedure.query(async () => {
    return getOutcomeDashboard();
  }),

  /** Effectiveness report: aggregated strategy effectiveness data */
  effectivenessReport: protectedProcedure.query(async () => {
    return getEffectivenessReport();
  }),

  /** Mission Control summary widget */
  missionControlSummary: protectedProcedure.query(async () => {
    return getMissionControlOutcomeSummary();
  }),

  /** Record a new outcome for a completed strategy path */
  recordOutcome: protectedProcedure
    .input(z.object({
      pathId: z.string(),
      strategyId: z.string(),
      patternId: z.string(),
      outcomeStatus: z.string(),
      outcomeDescription: z.string().optional(),
      interventionStartDate: z.string().optional(),
      interventionEndDate: z.string().optional(),
      lessonsLearned: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      return withEngineTracking({ engineId: ENGINE_IDS.OUTCOME, caseId: 0 }, async () => {
        return recordOutcome(input);
      });
    }),

  /** Update outcome with post-intervention metrics */
  updateMetrics: protectedProcedure
    .input(z.object({
      outcomeId: z.string(),
      outcomeStatus: z.string().optional(),
      signalsAfter: z.number().optional(),
      pressureAfter: z.number().optional(),
      trendAfter: z.string().optional(),
      entitiesAffected: z.number().optional(),
      geographicAreasAffected: z.number().optional(),
      totalCost: z.number().optional(),
      lessonsLearned: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const { outcomeId, ...params } = input;
      return updateOutcomeMetrics(outcomeId, params);
    }),

  /** Record a granular metric measurement */
  recordMetric: protectedProcedure
    .input(z.object({
      outcomeId: z.string(),
      metricName: z.string(),
      metricCategory: z.string(),
      valueBefore: z.number(),
      valueAfter: z.number(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      return recordOutcomeMetric(input);
    }),

  /** Trigger full feedback loop for a completed outcome */
  triggerFeedback: protectedProcedure
    .input(z.object({ outcomeId: z.string() }))
    .mutation(async ({ input }) => {
      return withEngineTracking({ engineId: ENGINE_IDS.OUTCOME, caseId: 0 }, async () => {
        return feedbackLoop(input.outcomeId);
      });
    }),
});
