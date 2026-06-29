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
  scoreEntityEvidence,
  getEntityEvidenceScore,
  evaluateVisibility,
  getVisibleEntities,
  getProvisionalEntities,
  renderSafeLanguage,
  exportEntityEvidence,
  getEvidenceThresholdStats,
} from "../engines/entity-evidence-threshold";
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
import {
  upsertMapNode,
  createMapEdge,
  buildMapFromSignals,
  getMapData,
  addAnnotation,
  getMapStats,
  upsertFailureProfile,
  calculateFailureProbability,
  recordTimelineEvent,
  getFailureProfiles,
  getProfileTimeline,
  getFailurePredictionStats,
} from "../engines/systemic-intelligence-map";

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

  // ─── Entity Evidence Threshold ───────────────────────────────────
  scoreEvidence: protectedProcedure
    .input(z.object({
      entityName: z.string(),
      patternId: z.number().optional(),
    }))
    .mutation(({ input }) => withEngineTracking({ engineId: ENGINE_IDS.EVIDENCE_THRESHOLD, caseId: 0 }, () => scoreEntityEvidence(input.entityName, input.patternId))),

  entityEvidenceScore: protectedProcedure
    .input(z.object({
      entityName: z.string(),
      patternId: z.number().optional(),
    }))
    .query(({ input }) => getEntityEvidenceScore(input.entityName, input.patternId)),

  entityVisibility: protectedProcedure
    .input(z.object({
      signalCount: z.number(),
      lawsuitCount: z.number(),
      enforcementCount: z.number(),
      streamCount: z.number(),
      confidenceScore: z.number(),
    }))
    .query(({ input }) => ({ result: evaluateVisibility(input) })),

  visibleEntities: protectedProcedure
    .query(() => getVisibleEntities()),

  provisionalEntities: protectedProcedure
    .query(() => getProvisionalEntities()),

  safeLanguage: protectedProcedure
    .input(z.object({
      entityName: z.string(),
      complaintCount: z.number(),
      lawsuitCount: z.number().optional(),
      enforcementCount: z.number().optional(),
      issue: z.string(),
    }))
    .query(({ input }) => ({
      text: renderSafeLanguage(input.entityName, {
        complaintCount: input.complaintCount,
        lawsuitCount: input.lawsuitCount || 0,
        enforcementCount: input.enforcementCount || 0,
        issue: input.issue,
      }),
    })),

  exportEvidence: protectedProcedure
    .input(z.object({ entityName: z.string() }))
    .query(({ input }) => exportEntityEvidence(input.entityName)),

  evidenceThresholdStats: protectedProcedure
    .query(() => getEvidenceThresholdStats()),

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

  // ─── Global Systemic Intelligence Map ────────────────────────────
  upsertNode: protectedProcedure
    .input(z.object({
      nodeType: z.string(),
      nodeName: z.string(),
      jurisdiction: z.string().optional(),
      industry: z.string().optional(),
      riskScore: z.number().optional(),
      patternCount: z.number().optional(),
    }))
    .mutation(({ input }) => withEngineTracking({ engineId: "systemic-map-engine", caseId: 0 }, () => upsertMapNode(input))),

  createEdge: protectedProcedure
    .input(z.object({
      sourceNodeId: z.number(),
      targetNodeId: z.number(),
      edgeType: z.string(),
      weight: z.number().optional(),
    }))
    .mutation(({ input }) => withEngineTracking({ engineId: "systemic-map-engine", caseId: 0 }, () => createMapEdge(input))),

  buildMap: protectedProcedure
    .mutation(() => withEngineTracking({ engineId: "systemic-map-engine", caseId: 0 }, () => buildMapFromSignals())),

  mapData: protectedProcedure
    .input(z.object({
      nodeType: z.string().optional(),
      minRiskScore: z.number().optional(),
    }).optional())
    .query(({ input }) => getMapData(input || undefined)),

  addAnnotation: protectedProcedure
    .input(z.object({
      nodeId: z.number(),
      note: z.string(),
    }))
    .mutation(({ ctx, input }) => withEngineTracking({ engineId: "systemic-map-engine", caseId: 0 }, () => addAnnotation({
      nodeId: input.nodeId,
      analyst: ctx.user.name || ctx.user.id.toString(),
      note: input.note,
    }))),

  mapStats: protectedProcedure
    .query(() => getMapStats()),

  // ─── Institutional Failure Prediction ────────────────────────────
  upsertFailureProfile: protectedProcedure
    .input(z.object({
      institutionId: z.number(),
      complaintVolume: z.number().optional(),
      litigationVolume: z.number().optional(),
      regulatoryActions: z.number().optional(),
      enforcementActions: z.number().optional(),
      appealReversalRate: z.number().optional(),
      processingDelayIndex: z.number().optional(),
      policyShockScore: z.number().optional(),
    }))
    .mutation(({ input }) => withEngineTracking({ engineId: "failure-prediction-engine", caseId: 0 }, () => upsertFailureProfile(input))),

  calculateFailureProbability: protectedProcedure
    .input(z.object({
      complaintVolume: z.number(),
      enforcementRate: z.number(),
      responseTime: z.number(),
      historicalFailures: z.number(),
      budgetPressure: z.number(),
    }))
    .query(({ input }) => ({ probability: calculateFailureProbability(input) })),

  failureProfiles: protectedProcedure
    .input(z.object({ minProbability: z.number().optional() }).optional())
    .query(({ input }) => getFailureProfiles(input?.minProbability)),

  profileTimeline: protectedProcedure
    .input(z.object({ institutionId: z.number() }))
    .query(({ input }) => getProfileTimeline(input.institutionId)),

  recordTimelineEvent: protectedProcedure
    .input(z.object({
      institutionId: z.number(),
      eventType: z.string(),
      impactScore: z.number().optional(),
      metadata: z.record(z.string(), z.unknown()).optional(),
    }))
    .mutation(({ input }) => withEngineTracking({ engineId: "failure-prediction-engine", caseId: 0 }, () => recordTimelineEvent(input))),

  failurePredictionStats: protectedProcedure
    .query(() => getFailurePredictionStats()),

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
