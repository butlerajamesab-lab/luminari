/**
 * Streams Router — Unified tRPC router for all 5 data streams:
 * 1. Lobbying Disclosure
 * 2. Federal Litigation
 * 3. Administrative Decisions
 * 4. Verified User Reports
 * 5. Cross-Stream Correlation
 */
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";

import {
  ingestLobbyingRecords,
  runLobbyingSignalDetection,
  getTopLobbyingFirms,
  getLobbyingByPolicyArea,
  getLobbyingStats,
} from "../streams/lobbying-stream";

import {
  ingestLitigationRecords,
  runLitigationSignalDetection,
  getLitigationStats,
  getRecentFilings,
  getCasesByDefendant,
  getCaseOutcomeBreakdown,
} from "../streams/litigation-stream";

import {
  ingestAdminDecisions,
  runAdminDecisionSignalDetection,
  getAdminDecisionStats,
  getOutcomesByAgency,
} from "../streams/admin-decisions-stream";

import {
  submitReport,
  updateVerificationStatus,
  generateVerifiedSignals,
  getVerifiedReportStats,
  getRecentReports,
} from "../streams/verified-reports-stream";

import {
  detectCrossStreamCorrelations,
  storeCorrelations,
  getCorrelationStats,
  getRecentCorrelations,
  getCorrelationsByEntity,
} from "../streams/cross-stream-correlation";

import {
  ingestAdvocacyReports,
  runAdvocacySignalDetection,
  getAdvocacyStats,
  getRecentAdvocacyReports,
  getAdvocacyByOrganization,
  getAdvocacyByHarmType,
} from "../streams/advocacy-stream";

export const streamsRouter = router({
  // ── Lobbying ────────────────────────────────────────────────────
  lobbyingIngest: protectedProcedure
    .input(z.object({
      records: z.array(z.object({
        lobbyistName: z.string().optional(),
        lobbyingFirm: z.string().optional(),
        clientName: z.string(),
        industry: z.string().optional(),
        policyArea: z.string().optional(),
        lobbyingAmount: z.number().optional(),
        reportingPeriod: z.string().optional(),
        jurisdiction: z.string().optional(),
        legislatorsContacted: z.string().optional(),
        sourceUrl: z.string().optional(),
      })),
    }))
    .mutation(async ({ input }) => ingestLobbyingRecords(input.records)),

  lobbyingDetectSignals: protectedProcedure
    .mutation(async () => runLobbyingSignalDetection()),

  lobbyingStats: protectedProcedure
    .query(async () => getLobbyingStats()),

  lobbyingTopFirms: protectedProcedure
    .input(z.object({ limit: z.number().optional() }).optional())
    .query(async ({ input }) => getTopLobbyingFirms(input?.limit)),

  lobbyingByPolicy: protectedProcedure
    .input(z.object({ limit: z.number().optional() }).optional())
    .query(async ({ input }) => getLobbyingByPolicyArea(input?.limit)),

  // ── Federal Litigation ──────────────────────────────────────────
  litigationIngest: protectedProcedure
    .input(z.object({
      records: z.array(z.object({
        caseId: z.string().optional(),
        courtName: z.string().optional(),
        jurisdiction: z.string().optional(),
        filingDate: z.string().optional(),
        caseType: z.string().optional(),
        natureOfSuit: z.string().optional(),
        plaintiffName: z.string().optional(),
        defendantName: z.string().optional(),
        lawFirm: z.string().optional(),
        judge: z.string().optional(),
        industry: z.string().optional(),
        caseStatus: z.string().optional(),
        sourceUrl: z.string().optional(),
      })),
    }))
    .mutation(async ({ input }) => ingestLitigationRecords(input.records)),

  litigationDetectSignals: protectedProcedure
    .mutation(async () => runLitigationSignalDetection()),

  litigationStats: protectedProcedure
    .query(async () => getLitigationStats()),

  litigationRecentFilings: protectedProcedure
    .input(z.object({ limit: z.number().optional() }).optional())
    .query(async ({ input }) => getRecentFilings(input?.limit)),

  litigationByDefendant: protectedProcedure
    .input(z.object({ defendantName: z.string() }))
    .query(async ({ input }) => getCasesByDefendant(input.defendantName)),

  litigationOutcomes: protectedProcedure
    .query(async () => getCaseOutcomeBreakdown()),

  // ── Administrative Decisions ────────────────────────────────────
  adminDecisionsIngest: protectedProcedure
    .input(z.object({
      records: z.array(z.object({
        decisionId: z.string().optional(),
        agency: z.string(),
        program: z.string().optional(),
        jurisdiction: z.string().optional(),
        claimType: z.string().optional(),
        decisionDate: z.string().optional(),
        initialOutcome: z.string().optional(),
        appealOutcome: z.string().optional(),
        processingTimeDays: z.number().optional(),
        hearingRequested: z.boolean().optional(),
        reversal: z.boolean().optional(),
        entityOrAgency: z.string().optional(),
        sourceUrl: z.string().optional(),
      })),
    }))
    .mutation(async ({ input }) => ingestAdminDecisions(input.records)),

  adminDecisionsDetectSignals: protectedProcedure
    .mutation(async () => runAdminDecisionSignalDetection()),

  adminDecisionsStats: protectedProcedure
    .query(async () => getAdminDecisionStats()),

  adminDecisionsOutcomesByAgency: protectedProcedure
    .input(z.object({ limit: z.number().optional() }).optional())
    .query(async ({ input }) => getOutcomesByAgency(input?.limit)),

  // ── Verified User Reports ───────────────────────────────────────
  submitReport: protectedProcedure
    .input(z.object({
      reporterType: z.string(),
      jurisdiction: z.string().optional(),
      industry: z.string().optional(),
      entityNamed: z.string().optional(),
      claimType: z.string().optional(),
      evidenceCount: z.number().optional(),
      narrative: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => submitReport({ ...input, submittedBy: ctx.user.id })),

  updateVerification: protectedProcedure
    .input(z.object({
      reportId: z.string(),
      status: z.enum(["unverified", "community_confirmed", "evidence_verified", "legal_verified"]),
    }))
    .mutation(async ({ input }) => updateVerificationStatus(input.reportId, input.status)),

  verifiedSignals: protectedProcedure
    .mutation(async () => generateVerifiedSignals()),

  verifiedReportStats: protectedProcedure
    .query(async () => getVerifiedReportStats()),

  recentReports: protectedProcedure
    .input(z.object({ limit: z.number().optional() }).optional())
    .query(async ({ input }) => getRecentReports(input?.limit)),

  // ── Civil Society / Advocacy ────────────────────────────────────
  advocacyIngest: protectedProcedure
    .input(z.object({
      records: z.array(z.object({
        organizationName: z.string(),
        organizationType: z.string().optional(),
        reportTitle: z.string(),
        reportType: z.string().optional(),
        jurisdiction: z.string().optional(),
        policyArea: z.string().optional(),
        industry: z.string().optional(),
        entityNamed: z.string().optional(),
        claimType: z.string().optional(),
        harmType: z.string().optional(),
        affectedPopulation: z.string().optional(),
        estimatedAffectedCount: z.number().optional(),
        keyFindings: z.string().optional(),
        recommendedActions: z.string().optional(),
        sourceUrl: z.string().optional(),
        publishDate: z.string().optional(),
        tags: z.array(z.string()).optional(),
      })),
    }))
    .mutation(async ({ input, ctx }) => ingestAdvocacyReports(input.records, ctx.user.id)),

  advocacyDetectSignals: protectedProcedure
    .mutation(async () => runAdvocacySignalDetection()),

  advocacyStats: protectedProcedure
    .query(async () => getAdvocacyStats()),

  advocacyRecentReports: protectedProcedure
    .input(z.object({ limit: z.number().optional() }).optional())
    .query(async ({ input }) => getRecentAdvocacyReports(input?.limit)),

  advocacyByOrganization: protectedProcedure
    .input(z.object({ limit: z.number().optional() }).optional())
    .query(async ({ input }) => getAdvocacyByOrganization(input?.limit)),

  advocacyByHarmType: protectedProcedure
    .input(z.object({ limit: z.number().optional() }).optional())
    .query(async ({ input }) => getAdvocacyByHarmType(input?.limit)),

  // ── Cross-Stream Correlation ────────────────────────────────────
  detectCorrelations: protectedProcedure
    .input(z.object({ timeWindowDays: z.number().optional() }).optional())
    .mutation(async ({ input }) => {
      const correlations = await detectCrossStreamCorrelations(input?.timeWindowDays);
      if (correlations.length > 0) {
        await storeCorrelations(correlations);
      }
      return { found: correlations.length, correlations };
    }),

  correlationStats: protectedProcedure
    .query(async () => getCorrelationStats()),

  recentCorrelations: protectedProcedure
    .input(z.object({ limit: z.number().optional() }).optional())
    .query(async ({ input }) => getRecentCorrelations(input?.limit)),

  correlationsByEntity: protectedProcedure
    .input(z.object({ entity: z.string() }))
    .query(async ({ input }) => getCorrelationsByEntity(input.entity)),
});
