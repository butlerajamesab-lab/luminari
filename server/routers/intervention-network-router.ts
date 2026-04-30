import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import {
  getEndpointsFiltered,
  getEndpointById,
  getRoutesForPattern,
  checkEscalationRules,
  getInterventionDashboard,
  getMissionControlInterventionSummary,
  createSubmission,
  updateSubmissionStatus,
  getSubmissionsForPattern,
  getSubmissionsForCase,
} from "../intervention-network-engine";
import {
  buildInterventionAction,
  executeIntervention,
  getRecommendedActions,
  gatherEvidenceBundle,
  INTERVENTION_ACTION_TYPES,
} from "../intervention-action-builder";

export const interventionNetworkRouter = router({
  // ─── Dashboard ─────────────────────────────────────────────────────
  dashboard: protectedProcedure.query(async () => {
    return getInterventionDashboard();
  }),

  missionControlSummary: protectedProcedure.query(async () => {
    return getMissionControlInterventionSummary();
  }),

  // ─── Endpoints ─────────────────────────────────────────────────────
  endpoints: protectedProcedure
    .input(z.object({
      jurisdictionScope: z.string().optional(),
      interventionType: z.string().optional(),
    }).optional())
    .query(async ({ input }) => {
      return getEndpointsFiltered(input);
    }),

  endpointDetail: protectedProcedure
    .input(z.object({ endpointId: z.string() }))
    .query(async ({ input }) => {
      return getEndpointById(input.endpointId);
    }),

  // ─── Routing ───────────────────────────────────────────────────────
  routesForPattern: protectedProcedure
    .input(z.object({
      patternType: z.string(),
      harmDomain: z.string().optional(),
      jurisdictionScope: z.string().optional(),
    }))
    .query(async ({ input }) => {
      return getRoutesForPattern(input.patternType, input.harmDomain, input.jurisdictionScope);
    }),

  // ─── Escalation ────────────────────────────────────────────────────
  checkEscalation: protectedProcedure
    .input(z.object({
      patternType: z.string(),
      harmDomain: z.string().optional(),
      signalCount: z.number(),
      pressureIndex: z.number(),
      confidenceScore: z.number(),
    }))
    .mutation(async ({ input }) => {
      return checkEscalationRules(input);
    }),

  // ─── Submissions ───────────────────────────────────────────────────
  submissionsForPattern: protectedProcedure
    .input(z.object({ patternId: z.string() }))
    .query(async ({ input }) => {
      return getSubmissionsForPattern(input.patternId);
    }),

  submissionsForCase: protectedProcedure
    .input(z.object({ caseId: z.number() }))
    .query(async ({ input }) => {
      return getSubmissionsForCase(input.caseId);
    }),

  createSubmission: protectedProcedure
    .input(z.object({
      endpointId: z.string(),
      patternId: z.string().optional(),
      strategyId: z.string().optional(),
      pathId: z.string().optional(),
      caseId: z.number().optional(),
      actionType: z.string(),
      actionDescription: z.string().optional(),
      submittedBy: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      return createSubmission({
        ...input,
        submittedBy: input.submittedBy || ctx.user.name || "system",
      });
    }),

  updateSubmissionStatus: protectedProcedure
    .input(z.object({
      submissionId: z.string(),
      status: z.string(),
      responseDetails: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      return updateSubmissionStatus(input.submissionId, input.status, input.responseDetails);
    }),

  // ─── Action Builder ────────────────────────────────────────────────
  buildAction: protectedProcedure
    .input(z.object({
      actionType: z.enum(INTERVENTION_ACTION_TYPES),
      endpointId: z.string(),
      caseId: z.number().optional(),
      patternId: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      return buildInterventionAction(input);
    }),

  executeIntervention: protectedProcedure
    .input(z.object({
      actionType: z.enum(INTERVENTION_ACTION_TYPES),
      endpointId: z.string(),
      caseId: z.number().optional(),
      patternId: z.string().optional(),
      strategyId: z.string().optional(),
      pathId: z.string().optional(),
      customDescription: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      return executeIntervention({
        ...input,
        userId: ctx.user.name || "system",
      });
    }),

  recommendedActions: protectedProcedure
    .input(z.object({
      patternType: z.string(),
      harmDomain: z.string().optional(),
      jurisdictionScope: z.string().optional(),
    }))
    .query(async ({ input }) => {
      return getRecommendedActions(input);
    }),

  gatherEvidence: protectedProcedure
    .input(z.object({
      caseId: z.number().optional(),
      patternId: z.string().optional(),
    }))
    .query(async ({ input }) => {
      return gatherEvidenceBundle(input);
    }),
});



// ============================================================
