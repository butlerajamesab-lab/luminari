import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import {
  getTrendDashboard,
  getTrendDetail,
  getMissionControlSummary,
  getAlertRules,
  updatePatternTrend,
  updateAllTrends,
} from "../trend-engine";
import { withEngineTracking, ENGINE_IDS } from "../engine-entrypoint-wrapper";

export const trendEngineRouter = router({
  /** Dashboard: list all current trends with classification, pressure, momentum */
  dashboard: protectedProcedure
    .input(
      z.object({
        classification: z.string().optional(),
        minPressure: z.number().optional(),
        limit: z.number().optional(),
        offset: z.number().optional(),
      }).optional()
    )
    .query(async ({ input }) => {
      return getTrendDashboard(input || undefined);
    }),

  /** Detail: full trend data for a single pattern including snapshots and pressure history */
  detail: protectedProcedure
    .input(z.object({ patternId: z.string() }))
    .query(async ({ input }) => {
      return getTrendDetail(input.patternId);
    }),

  /** Mission Control summary widget */
  missionControlSummary: protectedProcedure.query(async () => {
    return getMissionControlSummary();
  }),

  /** Alert rules configuration */
  alertRules: protectedProcedure.query(async () => {
    return getAlertRules();
  }),

  /** Update trend for a single pattern */
  updatePattern: protectedProcedure
    .input(z.object({ patternId: z.string() }))
    .mutation(async ({ input }) => {
      return withEngineTracking({ engineId: ENGINE_IDS.TREND, caseId: 0 }, async () => {
        return updatePatternTrend(input.patternId);
      });
    }),

  /** Run batch update for all active patterns */
  updateAll: protectedProcedure.mutation(async () => {
    return withEngineTracking({ engineId: ENGINE_IDS.TREND, caseId: 0 }, async () => {
      return updateAllTrends();
    });
  }),
});
