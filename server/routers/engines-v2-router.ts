/**
 * Engines V2 Router (Session 72)
 *
 * Exposes tRPC endpoints for:
 * - Additional Data Streams (Enforcement, Litigation, Media, Oversight)
 *
 * The Entity Intelligence, Institutional Accountability, Regulatory
 * Capture, and Crisis Prediction sections were removed with their
 * Mission Control panels in the Gate A removal (2026-11-19).
 */

import { z } from "zod";
import { router, protectedProcedure, adminProcedure } from "../_core/trpc";
import { withEngineTracking, ENGINE_IDS } from "../engine-entrypoint-wrapper";

export const enginesV2Router = router({
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
