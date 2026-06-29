/**
 * Engines V2 Router (Session 72)
 *
 * Exposes tRPC endpoints for:
 * - Entity Intelligence Layer
 * - Institutional Accountability Engine
 * - Regulatory Capture Detection Engine
 * - Crisis Prediction Engine
 * - Additional Data Streams (Enforcement, Litigation, Media, Oversight)
 */

import { z } from "zod";
import { router, protectedProcedure, adminProcedure } from "../_core/trpc";
import { withEngineTracking, ENGINE_IDS } from "../engine-entrypoint-wrapper";

export const enginesV2Router = router({
  // ═══════════════════════════════════════════
  // Entity Intelligence Layer
  // ═══════════════════════════════════════════

  entityStats: protectedProcedure.query(async () => {
    const { getEntityStats } = await import("../engines/entity-intelligence");
    return getEntityStats();
  }),

  entityList: protectedProcedure
    .input(z.object({
      type: z.string().optional(),
      industry: z.string().optional(),
      search: z.string().optional(),
      limit: z.number().optional(),
      offset: z.number().optional(),
    }).optional())
    .query(async ({ input }) => {
      const { listEntities } = await import("../engines/entity-intelligence");
      return listEntities(input);
    }),

  entityProfile: protectedProcedure
    .input(z.object({ entityId: z.number() }))
    .query(async ({ input }) => {
      const { getEntityProfile } = await import("../engines/entity-intelligence");
      return getEntityProfile(input.entityId);
    }),

  entityRelationships: protectedProcedure
    .input(z.object({ entityId: z.number() }))
    .query(async ({ input }) => {
      // @ts-ignore pre-existing type mismatch
      const { getEntityRelationships } = await import("../engines/entity-intelligence");
      return getEntityRelationships(input.entityId);
    }),

  resolveEntity: protectedProcedure
    .input(z.object({
      rawName: z.string(),
      datasetId: z.string().optional(),
      industry: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      return withEngineTracking({ engineId: ENGINE_IDS.ENTITY_INTELLIGENCE, caseId: 0 }, async () => {
        // @ts-ignore pre-existing type mismatch
        const { resolveEntity } = await import("../engines/entity-intelligence");
        return resolveEntity(input);
      });
    }),

  extractEntitiesFromSignals: protectedProcedure
    .mutation(async () => {
      return withEngineTracking({ engineId: ENGINE_IDS.ENTITY_INTELLIGENCE, caseId: 0 }, async () => {
        // @ts-ignore pre-existing type mismatch
        const { extractEntitiesFromSignals } = await import("../engines/entity-intelligence");
        return extractEntitiesFromSignals();
      });
    }),

  // ═══════════════════════════════════════════
  // Institutional Accountability Engine
  // ═══════════════════════════════════════════

  institutionStats: protectedProcedure.query(async () => {
    const { getInstitutionStats } = await import("../engines/institutional-accountability");
    return getInstitutionStats();
  }),

  institutionList: protectedProcedure
    .input(z.object({
      type: z.string().optional(),
      jurisdiction: z.string().optional(),
      search: z.string().optional(),
      limit: z.number().optional(),
      offset: z.number().optional(),
    }).optional())
    .query(async ({ input }) => {
      const { listInstitutions } = await import("../engines/institutional-accountability");
      return listInstitutions(input);
    }),

  enforcementGaps: protectedProcedure.query(async () => {
    const { detectEnforcementGaps } = await import("../engines/institutional-accountability");
    return detectEnforcementGaps();
  }),

  accountabilityAlerts: protectedProcedure.query(async () => {
    const { generateAccountabilityAlerts } = await import("../engines/institutional-accountability");
    return generateAccountabilityAlerts();
  }),

  calculateAccountability: protectedProcedure
    .input(z.object({ institutionId: z.number() }))
    .mutation(async ({ input }) => {
      return withEngineTracking({ engineId: ENGINE_IDS.INSTITUTIONAL_ACCOUNTABILITY, caseId: 0 }, async () => {
        const { calculateAccountabilityScore } = await import("../engines/institutional-accountability");
        return { score: await calculateAccountabilityScore(input.institutionId) };
      });
    }),

  seedInstitutions: adminProcedure.mutation(async () => {
    return withEngineTracking({ engineId: ENGINE_IDS.INSTITUTIONAL_ACCOUNTABILITY, caseId: 0 }, async () => {
      const { seedDefaultInstitutions } = await import("../engines/institutional-accountability");
      return seedDefaultInstitutions();
    });
  }),

  linkPatternToInstitutions: protectedProcedure
    .input(z.object({
      patternId: z.number(),
      industry: z.string().nullable(),
      jurisdiction: z.string().nullable(),
    }))
    .mutation(async ({ input }) => {
      return withEngineTracking({ engineId: ENGINE_IDS.INSTITUTIONAL_ACCOUNTABILITY, caseId: 0 }, async () => {
        const { linkPatternToInstitutions } = await import("../engines/institutional-accountability");
        return linkPatternToInstitutions(input.patternId, input.industry, input.jurisdiction);
      });
    }),

  recordInstitutionActivity: protectedProcedure
    .input(z.object({
      institutionId: z.number(),
      activityType: z.enum(["investigation_opened", "enforcement_action", "hearing_announced", "regulation_proposed", "policy_change", "public_statement"]),
      patternId: z.number().optional(),
      entityName: z.string().optional(),
      description: z.string().optional(),
      sourceStream: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      return withEngineTracking({ engineId: ENGINE_IDS.INSTITUTIONAL_ACCOUNTABILITY, caseId: 0 }, async () => {
        const { recordInstitutionActivity } = await import("../engines/institutional-accountability");
        return recordInstitutionActivity(input);
      });
    }),

  // ═══════════════════════════════════════════
  // Regulatory Capture Detection Engine
  // ═══════════════════════════════════════════

  captureStats: protectedProcedure.query(async () => {
    const { getCaptureStats } = await import("../engines/regulatory-capture");
    return getCaptureStats();
  }),

  capturePatterns: protectedProcedure
    .input(z.object({
      status: z.string().optional(),
      industry: z.string().optional(),
      minRiskScore: z.number().optional(),
      limit: z.number().optional(),
      offset: z.number().optional(),
    }).optional())
    .query(async ({ input }) => {
      const { listCapturePatterns } = await import("../engines/regulatory-capture");
      return listCapturePatterns(input);
    }),

  analyzeCaptureRisk: protectedProcedure
    .input(z.object({
      industry: z.string(),
      entityName: z.string().optional(),
      jurisdiction: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      return withEngineTracking({ engineId: ENGINE_IDS.REGULATORY_CAPTURE, caseId: 0 }, async () => {
        const { analyzeCaptureRisk } = await import("../engines/regulatory-capture");
        return analyzeCaptureRisk(input);
      });
    }),

  detectCaptureIndicators: protectedProcedure
    .input(z.object({
      industry: z.string(),
      entityName: z.string().optional(),
      jurisdiction: z.string().optional(),
    }))
    .query(async ({ input }) => {
      const { detectCaptureIndicators } = await import("../engines/regulatory-capture");
      return detectCaptureIndicators(input);
    }),

  // ═══════════════════════════════════════════
  // Crisis Prediction Engine
  // ═══════════════════════════════════════════

  crisisStats: protectedProcedure.query(async () => {
    const { getCrisisPredictionStats } = await import("../engines/crisis-prediction");
    return getCrisisPredictionStats();
  }),

  crisisPredictions: protectedProcedure
    .input(z.object({
      riskLevel: z.enum(["low", "moderate", "high", "critical"]).optional(),
      predictionType: z.enum(["industry_crisis", "institutional_failure", "enforcement_collapse", "policy_shockwave"]).optional(),
      minProbability: z.number().optional(),
      limit: z.number().optional(),
      offset: z.number().optional(),
    }).optional())
    .query(async ({ input }) => {
      const { listCrisisPredictions } = await import("../engines/crisis-prediction");
      return listCrisisPredictions(input);
    }),

  generateCrisisPrediction: protectedProcedure
    .input(z.object({
      industry: z.string().optional(),
      entityName: z.string().optional(),
      jurisdiction: z.string().optional(),
    }).optional())
    .mutation(async ({ input }) => {
      return withEngineTracking({ engineId: ENGINE_IDS.CRISIS_PREDICTION, caseId: 0 }, async () => {
        const { generateCrisisPrediction } = await import("../engines/crisis-prediction");
        return generateCrisisPrediction(input ?? {});
      });
    }),

  calculateCrisisProbability: protectedProcedure
    .input(z.object({
      industry: z.string().optional(),
      entityName: z.string().optional(),
      jurisdiction: z.string().optional(),
    }).optional())
    .query(async ({ input }) => {
      const { calculateCrisisProbability } = await import("../engines/crisis-prediction");
      return calculateCrisisProbability(input ?? {});
    }),

  // ═══════════════════════════════════════════
  // Additional Data Streams
  // ═══════════════════════════════════════════

  // Enforcement Actions
  ingestEnforcementAction: protectedProcedure
    .input(z.object({
      agencyName: z.string(),
      entityName: z.string(),
      industry: z.string().optional(),
      jurisdiction: z.string().optional(),
      violationType: z.string().optional(),
      penaltyAmount: z.number().optional(),
      investigationStartDate: z.number().optional(),
      resolutionDate: z.number().optional(),
      caseReference: z.string().optional(),
      sourceUrl: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      return withEngineTracking({ engineId: ENGINE_IDS.INGESTION, caseId: 0 }, async () => {
        const { ingestEnforcementAction } = await import("../streams/additional-streams");
        return ingestEnforcementAction(input);
      });
    }),

  enforcementActions: protectedProcedure
    .input(z.object({
      agency: z.string().optional(),
      entity: z.string().optional(),
      industry: z.string().optional(),
      limit: z.number().optional(),
      offset: z.number().optional(),
    }).optional())
    .query(async ({ input }) => {
      const { queryEnforcementActions } = await import("../streams/additional-streams");
      return queryEnforcementActions(input);
    }),

  enforcementStats: protectedProcedure.query(async () => {
    const { getEnforcementStats } = await import("../streams/additional-streams");
    return getEnforcementStats();
  }),

  // Litigation Cases
  ingestLitigationCase: protectedProcedure
    .input(z.object({
      courtName: z.string(),
      jurisdiction: z.string().optional(),
      filingDate: z.number().optional(),
      caseType: z.string().optional(),
      claimType: z.string().optional(),
      plaintiffName: z.string().optional(),
      defendantName: z.string().optional(),
      lawFirm: z.string().optional(),
      judge: z.string().optional(),
      caseStatus: z.enum(["filed", "pending", "discovery", "trial", "settled", "dismissed", "appealed"]).optional(),
      industry: z.string().optional(),
      sourceUrl: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      return withEngineTracking({ engineId: ENGINE_IDS.INGESTION, caseId: 0 }, async () => {
        const { ingestLitigationCase } = await import("../streams/additional-streams");
        return ingestLitigationCase(input);
      });
    }),

  litigationCases: protectedProcedure
    .input(z.object({
      defendant: z.string().optional(),
      plaintiff: z.string().optional(),
      court: z.string().optional(),
      status: z.string().optional(),
      limit: z.number().optional(),
      offset: z.number().optional(),
    }).optional())
    .query(async ({ input }) => {
      const { queryLitigationCases } = await import("../streams/additional-streams");
      return queryLitigationCases(input);
    }),

  litigationStats: protectedProcedure.query(async () => {
    const { getLitigationStats } = await import("../streams/additional-streams");
    return getLitigationStats();
  }),

  // Investigative Reports
  ingestInvestigativeReport: protectedProcedure
    .input(z.object({
      publicationName: z.string(),
      reportTitle: z.string(),
      issueArea: z.string().optional(),
      entitiesNamed: z.array(z.string()).optional(),
      jurisdiction: z.string().optional(),
      summary: z.string().optional(),
      sourceUrl: z.string().optional(),
      publicationDate: z.number().optional(),
      credibilityScore: z.number().optional(),
    }))
    .mutation(async ({ input }) => {
      return withEngineTracking({ engineId: ENGINE_IDS.INGESTION, caseId: 0 }, async () => {
        const { ingestInvestigativeReport } = await import("../streams/additional-streams");
        return ingestInvestigativeReport(input);
      });
    }),

  investigativeReports: protectedProcedure
    .input(z.object({
      publication: z.string().optional(),
      issueArea: z.string().optional(),
      limit: z.number().optional(),
      offset: z.number().optional(),
    }).optional())
    .query(async ({ input }) => {
      const { queryInvestigativeReports } = await import("../streams/additional-streams");
      return queryInvestigativeReports(input);
    }),

  investigativeStats: protectedProcedure.query(async () => {
    const { getInvestigativeReportStats } = await import("../streams/additional-streams");
    return getInvestigativeReportStats();
  }),

  // Oversight Reports
  ingestOversightReport: protectedProcedure
    .input(z.object({
      oversightBody: z.string(),
      reportTitle: z.string(),
      issueArea: z.string().optional(),
      agencyReviewed: z.string().optional(),
      jurisdiction: z.string().optional(),
      findingsSummary: z.string().optional(),
      sourceUrl: z.string().optional(),
      publicationDate: z.number().optional(),
      credibilityScore: z.number().optional(),
    }))
    .mutation(async ({ input }) => {
      return withEngineTracking({ engineId: ENGINE_IDS.INGESTION, caseId: 0 }, async () => {
        const { ingestOversightReport } = await import("../streams/additional-streams");
        return ingestOversightReport(input);
      });
    }),

  oversightReports: protectedProcedure
    .input(z.object({
      oversightBody: z.string().optional(),
      agencyReviewed: z.string().optional(),
      issueArea: z.string().optional(),
      limit: z.number().optional(),
      offset: z.number().optional(),
    }).optional())
    .query(async ({ input }) => {
      const { queryOversightReports } = await import("../streams/additional-streams");
      return queryOversightReports(input);
    }),

  oversightStats: protectedProcedure.query(async () => {
    const { getOversightReportStats } = await import("../streams/additional-streams");
    return getOversightReportStats();
  }),

  // Unified stream stats
  allStreamStats: protectedProcedure.query(async () => {
    const { getAllStreamStats } = await import("../streams/additional-streams");
    return getAllStreamStats();
  }),
});
