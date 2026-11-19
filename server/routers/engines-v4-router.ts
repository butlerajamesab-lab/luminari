import { z } from "zod";
import { router, publicProcedure, protectedProcedure } from "../_core/trpc";
import { withEngineTracking, ENGINE_IDS } from "../engine-entrypoint-wrapper";
import {
  executeInvestigativeQuery,
  getQueryHistory,
  getQueryResults,
  getInvestigativeQueryStats,
  SUGGESTED_QUERIES,
  parseInvestigativeQuery,
} from "../engines/investigative-query-engine";
import {
  getEntityBreakdown,
  generateEntityBreakdown,
  getResponsibleAgencies,
  generateResponsibleAgencyMapping,
  getTopEntitiesLeaderboard,
  generateInvestigativeBrief,
  getEntityTransparencyStats,
} from "../engines/entity-transparency";
import {
  calculateRiskScore,
  forecastPatternRisk,
  forecastEntityRisk,
  compareForecastWindows,
  generateForecastReport,
  listForecasts,
  getForecastStats,
} from "../engines/systemic-risk-forecast";
import {
  createSubscription,
  listUserSubscriptions,
  toggleSubscription,
  deleteSubscription,
  checkAlertTriggers,
  processEventsToDelivery,
  getUserNotifications,
  markNotificationRead,
  getAlertingStats,
} from "../engines/public-alerting";

export const enginesV4Router = router({
  // ─── Entity Transparency ─────────────────────────────────────────
  entityBreakdown: protectedProcedure
    .input(z.object({ patternId: z.number() }))
    .query(({ input }) => getEntityBreakdown(input.patternId)),

  generateEntityBreakdown: protectedProcedure
    .input(z.object({ patternId: z.number() }))
    .mutation(({ input }) => withEngineTracking({ engineId: ENGINE_IDS.ENTITY_TRANSPARENCY, caseId: 0 }, () => generateEntityBreakdown(input.patternId))),

  responsibleAgencies: protectedProcedure
    .input(z.object({ patternId: z.number() }))
    .query(({ input }) => getResponsibleAgencies(input.patternId)),

  generateAgencyMapping: protectedProcedure
    .input(z.object({ patternId: z.number() }))
    .mutation(({ input }) => withEngineTracking({ engineId: ENGINE_IDS.ENTITY_TRANSPARENCY, caseId: 0 }, () => generateResponsibleAgencyMapping(input.patternId))),

  topEntities: protectedProcedure
    .input(z.object({ limit: z.number().optional() }).optional())
    .query(({ input }) => getTopEntitiesLeaderboard(input?.limit)),

  investigativeBrief: protectedProcedure
    .input(z.object({ patternId: z.number() }))
    .query(({ input }) => generateInvestigativeBrief(input.patternId)),

  entityTransparencyStats: protectedProcedure
    .query(() => getEntityTransparencyStats()),

  // ─── Systemic Risk Forecast ──────────────────────────────────────
  calculateRisk: protectedProcedure
    .input(z.object({
      patternPressure: z.number(),
      signalVelocity: z.number(),
      streamDiversity: z.number(),
      enforcementGap: z.number(),
      geographicSpread: z.number(),
    }))
    .query(({ input }) => ({ score: calculateRiskScore(input as any) })),

  forecastPatternRisk: protectedProcedure
    .input(z.object({
      patternId: z.number(),
      windowDays: z.number().optional(),
    }))
    .mutation(({ input }) => withEngineTracking({ engineId: ENGINE_IDS.RISK_FORECAST, caseId: 0 }, () => forecastPatternRisk(input.patternId, input.windowDays))),

  forecastEntityRisk: protectedProcedure
    .input(z.object({
      entityName: z.string(),
      windowDays: z.number().optional(),
    }))
    .mutation(({ input }) => withEngineTracking({ engineId: ENGINE_IDS.RISK_FORECAST, caseId: 0 }, () => forecastEntityRisk(input.entityName, input.windowDays))),

  compareForecastWindows: protectedProcedure
    .input(z.object({
      scope: z.string(),
      scopeId: z.number().nullable().optional(),
      scopeName: z.string(),
    }))
    .query(({ input }) => compareForecastWindows(input.scope, input.scopeId ?? null, input.scopeName)),

  forecastReport: protectedProcedure
    .input(z.object({
      scope: z.string(),
      scopeId: z.number().nullable().optional(),
      scopeName: z.string(),
    }))
    .query(({ input }) => generateForecastReport(input.scope, input.scopeId ?? null, input.scopeName)),

  listForecasts: protectedProcedure
    .input(z.object({
      scope: z.string().optional(),
      limit: z.number().optional(),
    }).optional())
    .query(({ input }) => listForecasts(input?.scope, input?.limit)),

  riskForecastStats: protectedProcedure
    .query(() => getForecastStats()),

  // ─── Public Alerting & Subscriptions ─────────────────────────────
  createSubscription: protectedProcedure
    .input(z.object({
      subscriptionType: z.string(),
      targetId: z.number().optional(),
      targetName: z.string(),
      alertChannel: z.string().optional(),
      alertFrequency: z.string().optional(),
      thresholdRiskScore: z.number().optional(),
      thresholdSignalCount: z.number().optional(),
    }))
    .mutation(({ ctx, input }) => withEngineTracking({ engineId: "public-alerting-engine", caseId: 0 }, () => createSubscription({
      userId: ctx.user.id.toString(),
      subscriptionType: input.subscriptionType,
      targetId: input.targetId,
      targetName: input.targetName,
      alertChannel: input.alertChannel || "in_app",
      alertFrequency: input.alertFrequency || "immediate",
      thresholdRiskScore: input.thresholdRiskScore,
      thresholdSignalCount: input.thresholdSignalCount,
    }))),

  mySubscriptions: protectedProcedure
    .query(({ ctx }) => listUserSubscriptions(ctx.user.id.toString())),

  toggleSubscription: protectedProcedure
    .input(z.object({ subscriptionId: z.number(), isActive: z.boolean() }))
    .mutation(({ input }) => withEngineTracking({ engineId: "public-alerting-engine", caseId: 0 }, () => toggleSubscription(input.subscriptionId, input.isActive))),

  deleteSubscription: protectedProcedure
    .input(z.object({ subscriptionId: z.number() }))
    .mutation(({ input }) => withEngineTracking({ engineId: "public-alerting-engine", caseId: 0 }, () => deleteSubscription(input.subscriptionId))),

  checkAlerts: protectedProcedure
    .mutation(() => withEngineTracking({ engineId: "public-alerting-engine", caseId: 0 }, () => checkAlertTriggers())),

  processDeliveries: protectedProcedure
    .mutation(() => withEngineTracking({ engineId: "public-alerting-engine", caseId: 0 }, () => processEventsToDelivery())),

  myNotifications: protectedProcedure
    .input(z.object({ limit: z.number().optional() }).optional())
    .query(({ ctx, input }) => getUserNotifications(ctx.user.id.toString(), input?.limit)),

  markNotificationRead: protectedProcedure
    .input(z.object({ eventId: z.number() }))
    .mutation(({ input }) => withEngineTracking({ engineId: "public-alerting-engine", caseId: 0 }, () => markNotificationRead(input.eventId))),

  alertingStats: protectedProcedure
    .query(() => getAlertingStats()),

  // ─── Investigative Query Engine ──────────────────────────────────
  runInvestigativeQuery: protectedProcedure
    .input(z.object({ queryText: z.string() }))
    .mutation(({ ctx, input }) => withEngineTracking({ engineId: ENGINE_IDS.INVESTIGATIVE_QUERY, caseId: 0 }, () => executeInvestigativeQuery(input.queryText, ctx.user.id.toString()))),

  parseQuery: protectedProcedure
    .input(z.object({ queryText: z.string() }))
    .query(({ input }) => ({ parsed: parseInvestigativeQuery(input.queryText) })),

  queryHistory: protectedProcedure
    .input(z.object({ limit: z.number().optional() }).optional())
    .query(({ ctx, input }) => getQueryHistory(ctx.user.id.toString(), input?.limit)),

  queryResults: protectedProcedure
    .input(z.object({ queryId: z.number() }))
    .query(({ input }) => getQueryResults(input.queryId)),

  suggestedQueries: protectedProcedure
    .query(() => SUGGESTED_QUERIES),

  investigativeQueryStats: protectedProcedure
    .query(() => getInvestigativeQueryStats()),
});
