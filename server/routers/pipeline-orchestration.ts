import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { db } from "../db";
import { eq, and, desc } from "drizzle-orm";
import { engineRunsCanonical as engineRuns } from "../engine-runs-schema";
import {
  strategyMatterProfile, strategyFactMatrix, strategyClaimCandidates,
  strategyViabilityAssessment, strategyDeadlineEngine,
  strategyElementFactLinks, strategyMissingEvidenceTasks, strategyPaths,
  assemblyFilingPackets, assemblyGeneratedSections,
  patternFeedbackLoop,
} from "../../drizzle/schema";

// ═══════════════════════════════════════════════════════════════════════════
// PIPELINE ORCHESTRATION — Cross-Engine Coordination
//
// This is downstream orchestration. It is not the Universal Intake Spine and
// must not be presented as the canonical intake/reconstruction action.
// ═══════════════════════════════════════════════════════════════════════════

export const pipelineOrchestrationRouter = router({
  getEngineRuns: protectedProcedure
    .input(z.object({ caseId: z.number() }))
    .query(async ({ input }) => {
      return db.select().from(engineRuns)
        .where(eq(engineRuns.caseId, input.caseId))
        .orderBy(desc(engineRuns.createdAt));
    }),

  getPipelineStatus: protectedProcedure
    .input(z.object({ caseId: z.number() }))
    .query(async ({ input }) => {
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

        const candidates = await db.select().from(strategyClaimCandidates)
          .where(and(eq(strategyClaimCandidates.caseId, input.caseId), eq(strategyClaimCandidates.matterProfileId, latestProfile.id)));
        candidateCount = candidates.length;

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
          .where(eq(strategyPaths.caseId, String(input.caseId)));
        pathCount = paths.length;
      }

      const packets = await db.select().from(assemblyFilingPackets)
        .where(eq(assemblyFilingPackets.caseId, input.caseId));

      let sectionCount = 0;
      for (const packet of packets) {
        const sections = await db.select().from(assemblyGeneratedSections)
          .where(eq(assemblyGeneratedSections.packetId, packet.id));
        sectionCount += sections.length;
      }

      const feedback = await db.select().from(patternFeedbackLoop);

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
          counts: {
            facts: factCount,
            candidates: candidateCount,
            assessments: assessmentCount,
            deadlines: deadlineCount,
            links: linkCount,
            tasks: taskCount,
            paths: pathCount,
          },
        },
        assembly_engine: {
          status: packets.length > 0 ? "initialized" : "not_started",
          packet_count: packets.length,
          sectionCount,
          packets: packets.map((packet: any) => ({
            id: packet.id,
            name: packet.packetName,
            type: packet.packetType,
            status: packet.packetStatus,
          })),
        },
        pattern_engine: {
          feedback_count: feedback.length,
        },
      };
    }),

  getLatestRun: protectedProcedure
    .input(z.object({ caseId: z.number() }))
    .query(async ({ input }) => {
      const [run] = await db.select().from(engineRuns)
        .where(eq(engineRuns.caseId, input.caseId))
        .orderBy(desc(engineRuns.createdAt))
        .limit(1);
      return run ?? null;
    }),

  cancelRun: protectedProcedure
    .input(z.object({ runId: z.number() }))
    .mutation(async ({ input }) => {
      await db.update(engineRuns)
        .set({
          runStatus: "cancelled",
          status: "cancelled",
          completedAt: Date.now(),
        })
        .where(eq(engineRuns.id, input.runId));
      return { success: true };
    }),
});
