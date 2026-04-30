/**
 * Case → Pattern Bridge Router
 * 
 * Endpoints for:
 *   - Running the bridge on a specific case
 *   - Viewing case signals
 *   - Viewing case → pattern links
 *   - Pattern candidate dashboard
 *   - Pattern candidate management (promote, reject, dormant)
 */
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import {
  runCasePatternBridge,
  getCaseSignals,
  getCasePatterns,
  getPatternCandidateDashboard,
  getPatternSupportingCases,
} from "../case-pattern-bridge";
import { db } from "../db";
import { caseSignals, patternCandidates, casePatternLinks } from "../../drizzle/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import { governedPatternCandidateStatus } from "../governance-hooks";

export const casePatternBridgeRouter = router({
  // Run the full bridge pipeline for a case
  runBridge: protectedProcedure
    .input(z.object({ caseId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const result = await runCasePatternBridge(input.caseId, ctx.user.id);
      return result;
    }),

  // Get all signals extracted from a specific case
  getCaseSignals: protectedProcedure
    .input(z.object({ caseId: z.number() }))
    .query(async ({ input }) => {
      return getCaseSignals(input.caseId);
    }),

  // Get all pattern candidates linked to a specific case
  getCasePatterns: protectedProcedure
    .input(z.object({ caseId: z.number() }))
    .query(async ({ input }) => {
      return getCasePatterns(input.caseId);
    }),

  // Get the pattern candidate dashboard (all candidates with stats)
  candidateDashboard: protectedProcedure
    .query(async () => {
      return getPatternCandidateDashboard();
    }),

  // Get cases supporting a specific pattern candidate
  supportingCases: protectedProcedure
    .input(z.object({ candidateId: z.number() }))
    .query(async ({ input }) => {
      return getPatternSupportingCases(input.candidateId);
    }),

  // Update pattern candidate status (promote, reject, dormant)
  // GOVERNED: Pattern candidate status is a control-plane decision
  updateCandidateStatus: protectedProcedure
    .input(z.object({
      candidateId: z.number(),
      status: z.enum(["candidate", "active", "dormant", "rejected"]),
      rationale: z.string().min(10),
    }))
    .mutation(async ({ ctx, input }) => {
      await governedPatternCandidateStatus({
        candidateId: input.candidateId,
        status: input.status,
        rationale: input.rationale,
        actorId: ctx.user.openId,
        actorRole: "admin",
      });
      return { success: true };
    }),

  // Get bridge summary stats
  bridgeStats: protectedProcedure
    .query(async () => {
      const [signalStats] = await db.select({
        totalSignals: sql<number>`COUNT(*)`,
        activeSignals: sql<number>`SUM(CASE WHEN active = 1 THEN 1 ELSE 0 END)`,
        uniqueCases: sql<number>`COUNT(DISTINCT case_id)`,
      }).from(caseSignals);

      const [candidateStats] = await db.select({
        totalCandidates: sql<number>`COUNT(*)`,
        activeCandidates: sql<number>`SUM(CASE WHEN pattern_status = 'candidate' THEN 1 ELSE 0 END)`,
        promotedCandidates: sql<number>`SUM(CASE WHEN pattern_status = 'active' THEN 1 ELSE 0 END)`,
        dormantCandidates: sql<number>`SUM(CASE WHEN pattern_status = 'dormant' THEN 1 ELSE 0 END)`,
        rejectedCandidates: sql<number>`SUM(CASE WHEN pattern_status = 'rejected' THEN 1 ELSE 0 END)`,
      }).from(patternCandidates);

      const [linkStats] = await db.select({
        totalLinks: sql<number>`COUNT(*)`,
        uniqueLinkedCases: sql<number>`COUNT(DISTINCT case_id)`,
      }).from(casePatternLinks);

      return {
        signals: {
          total: signalStats?.totalSignals || 0,
          active: signalStats?.activeSignals || 0,
          uniqueCases: signalStats?.uniqueCases || 0,
        },
        candidates: {
          total: candidateStats?.totalCandidates || 0,
          pending: candidateStats?.activeCandidates || 0,
          promoted: candidateStats?.promotedCandidates || 0,
          dormant: candidateStats?.dormantCandidates || 0,
          rejected: candidateStats?.rejectedCandidates || 0,
        },
        links: {
          total: linkStats?.totalLinks || 0,
          uniqueCases: linkStats?.uniqueLinkedCases || 0,
        },
      };
    }),

  // Bulk run bridge on all cases for a user
  bulkRunBridge: protectedProcedure
    .mutation(async ({ ctx }) => {
      const { cases } = await import("../../drizzle/schema");
      const userCases = await db.select({ id: cases.id })
        .from(cases)
        .where(eq(cases.userId, ctx.user.id));

      let totalSignals = 0;
      let totalCandidates = 0;
      let totalPromoted = 0;
      let errors = 0;

      for (const c of userCases) {
        try {
          const result = await runCasePatternBridge(c.id, ctx.user.id);
          totalSignals += result.signalsStored;
          totalCandidates += result.candidatesCreated;
          totalPromoted += result.candidatesPromoted;
        } catch (err) {
          console.error(`[CasePatternBridge] Error on case ${c.id}:`, err);
          errors++;
        }
      }

      return {
        casesProcessed: userCases.length,
        totalSignals,
        totalCandidates,
        totalPromoted,
        errors,
      };
    }),
});



// ============================================================
