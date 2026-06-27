import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { db } from "../db";
import { eq, and, desc } from "drizzle-orm";
import {
  engineRuns, cases,
  strategyMatterProfile, strategyFactMatrix, strategyClaimCandidates,
  strategyViabilityAssessment, strategyDeadlineEngine,
  strategyElementFactLinks, strategyMissingEvidenceTasks, strategyPaths,
  assemblyFilingPackets, assemblyGeneratedSections,
  patternAggregationRuns, patternFeedbackLoop,
} from "../../drizzle/schema";

// ═══════════════════════════════════════════════════════════════════════════
// PIPELINE ORCHESTRATION — Cross-Engine Coordination
//
// Provides a unified view of engine runs, pipeline status,
// and cross-engine data flow.
// ═══════════════════════════════════════════════════════════════════════════

export const pipelineOrchestrationRouter = router({

  // ─── Get Engine Runs for a Case ─────────────────────────────────────
  getEngineRuns: protectedProcedure
    .input(z.object({ caseId: z.number() }))
    .query(async ({ input }) => {
      return db.select().from(engineRuns)
        .where(eq(engineRuns.caseId, input.caseId))
        .orderBy(desc(engineRuns.createdAt));
    }),

  // ─── Get Full Pipeline Status ───────────────────────────────────────
  getPipelineStatus: protectedProcedure
    .input(z.object({ caseId: z.number() }))
    .query(async ({ input }) => {
      // Strategy Engine status
      const matterProfiles = await db.select().from(strategyMatterProfile)
        .where(eq(strategyMatterProfile.caseId, input.caseId));
      const latestProfile = matterProfiles[0];

      let factCount = 0;
      let candidateCount = 0;
      let assessmentCount = 0;
      let deadlineCount = 0;
      let linkCount = 0;
      let taskCount = 0;
      let pathCount = 0;

      if (latestProfile) {
        const facts = await db.select().from(strategyFactMatrix)
          .where(and(eq(strategyFactMatrix.caseId, input.caseId), eq(strategyFactMatrix.matterProfileId, latestProfile.id)));
        factCount = facts.length;

        const cands = await db.select().from(strategyClaimCandidates)
          .where(and(eq(strategyClaimCandidates.caseId, input.caseId), eq(strategyClaimCandidates.matterProfileId, latestProfile.id)));
        candidateCount = cands.length;

        const assessments = await db.select().from(strategyViabilityAssessment)
          .where(eq(strategyViabilityAssessment.caseId, input.caseId));
        assessmentCount = assessments.length;

        const deadlines = await db.select().from(strategyDeadlineEngine)
          .where(eq(strategyDeadlineEngine.caseId, input.caseId));
        deadlineCount = deadlines.length;

        const links = await db.select().from(strategyElementFactLinks)
          .where(eq(strategyElementFactLinks.caseId, input.caseId));
        linkCount = links.length;

        const tasks = await db.select().from(strategyMissingEvidenceTasks)
          .where(eq(strategyMissingEvidenceTasks.caseId, input.caseId));
        taskCount = tasks.length;

        const paths = await db.select().from(strategyPaths)
          .where(eq(strategyPaths.caseId, input.caseId));
        pathCount = paths.length;
      }

      // Assembly Engine status
      const packets = await db.select().from(assemblyFilingPackets)
        .where(eq(assemblyFilingPackets.caseId, input.caseId));

      let sectionCount = 0;
      for (const p of packets) {
        const sections = await db.select().from(assemblyGeneratedSections)
          .where(eq(assemblyGeneratedSections.packetId, p.id));
        sectionCount += sections.length;
      }

      // Pattern Engine status
      const feedback = await db.select().from(patternFeedbackLoop);
      const caseFeedback = feedback.filter(f => {
        // Check if any strategy path for this case has feedback
        return true; // simplified — all feedback is relevant
      });

      return {
        strategy_engine: {
          status: latestProfile ? "initialized" : "not_started",
          matter_profile_id: latestProfile?.id ?? null,
          stages: {
            S1_matterProfile: matterProfiles.length > 0,
            S2_factMatrix: factCount > 0,
            S3_claimCandidates: candidateCount > 0,
            S4_viabilityAssessment: assessmentCount > 0,
            S5_deadlines: deadlineCount > 0,
            S6_elementLinks: linkCount > 0,
            S7_missingEvidence: taskCount > 0,
            S8_strategyPaths: pathCount > 0,
          },
          counts: { facts: factCount, candidates: candidateCount, assessments: assessmentCount, deadlines: deadlineCount, links: linkCount, tasks: taskCount, paths: pathCount },
        },
        assembly_engine: {
          status: packets.length > 0 ? "initialized" : "not_started",
          packet_count: packets.length,
          sectionCount,
          packets: packets.map(p => ({ id: p.id, name: p.packetName, type: p.packetType, status: p.packetStatus })),
        },
        pattern_engine: {
          feedback_count: caseFeedback.length,
        },
      };
    }),

  // ─── Get Latest Engine Run ──────────────────────────────────────────
  getLatestRun: protectedProcedure
    .input(z.object({ caseId: z.number() }))
    .query(async ({ input }) => {
      const [run] = await db.select().from(engineRuns)
        .where(eq(engineRuns.caseId, input.caseId))
        .orderBy(desc(engineRuns.createdAt))
        .limit(1);
      return run ?? null;
    }),

  // ─── Cancel Engine Run ──────────────────────────────────────────────
  cancelRun: protectedProcedure
    .input(z.object({ runId: z.number() }))
    .mutation(async ({ input }) => {
      await db.update(engineRuns).set({
        runStatus: "cancelled" as any,
        completedAt: Date.now(),
      }).where(eq(engineRuns.id, input.runId));
      return { success: true };
    }),
});
