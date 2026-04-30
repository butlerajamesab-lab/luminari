/**
 * Strategy Learning Loop — tRPC Router
 */
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import {
  completeStrategyPathWithOutcome,
  processPendingFeedback,
  recalculateStrategyWeights,
  runFullLearningCycle,
  getLearningLoopStatus,
} from "../strategy-learning-loop";
import {
  runScheduledFeedbackCycle,
  getOutcomeFeedbackSchedulerStatus,
} from "../outcome-feedback-scheduler";

export const learningLoopRouter = router({
  /** Get learning loop status — pending feedback, processed counts, etc. */
  status: protectedProcedure.query(async () => {
    return getLearningLoopStatus();
  }),

  /** Complete a strategy path and record its outcome in one step */
  completePathWithOutcome: protectedProcedure
    .input(z.object({
      pathId: z.string(),
      outcomeStatus: z.enum(["successful", "partial", "failed"]),
      outcomeDescription: z.string().optional(),
      signalsAfter: z.number().optional(),
      pressureAfter: z.number().optional(),
      trendAfter: z.string().optional(),
      entitiesAffected: z.number().optional(),
      geographicAreasAffected: z.number().optional(),
      totalCost: z.number().optional(),
      lessonsLearned: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      return completeStrategyPathWithOutcome(input);
    }),

  /** Process all pending feedback (batch) */
  processPendingFeedback: protectedProcedure.mutation(async () => {
    return processPendingFeedback();
  }),

  /** Recalculate strategy weights from success rates */
  recalculateWeights: protectedProcedure.mutation(async () => {
    return recalculateStrategyWeights();
  }),

  /** Run full learning cycle: feedback → weights → re-evaluation */
  runFullCycle: protectedProcedure.mutation(async () => {
    return runFullLearningCycle();
  }),

  /** Get outcome feedback scheduler status */
  schedulerStatus: protectedProcedure.query(async () => {
    return getOutcomeFeedbackSchedulerStatus();
  }),

  /** Manually trigger a scheduled feedback cycle */
  triggerScheduledCycle: protectedProcedure.mutation(async () => {
    return runScheduledFeedbackCycle();
  }),
});



// ============================================================
