import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { withEngineTracking, ENGINE_IDS } from "../engine-entrypoint-wrapper";
import {
  checkAndCreateCampaigns,
  createCampaign,
  getCampaign,
  listCampaigns,
  advanceCampaignStage,
  linkReformPackage,
  addCoalitionMember,
  getCoalitionMembers,
  addCampaignTarget,
  getCampaignTargets,
  updateTargetStatus,
  logAction,
  getCampaignActions,
  recordOutcome,
  getCampaignOutcomes,
  getCampaignDashboard,
  getCampaignDetail,
  CAMPAIGN_STAGES,
} from "../campaign-engine-service";

export const campaignEngineRouter = router({
  // Auto-create campaigns from critical patterns
  autoCreate: protectedProcedure
    .mutation(async () => {
      return withEngineTracking({ engineId: ENGINE_IDS.CAMPAIGN, caseId: 0 }, () => checkAndCreateCampaigns());
    }),

  // Manual campaign creation
  create: protectedProcedure
    .input(z.object({
      name: z.string(),
      patternId: z.string().optional(),
      jurisdiction: z.string(),
      description: z.string().optional(),
      impactIndex: z.number().min(0).max(100).optional(),
    }))
    .mutation(async ({ input }) => {
      return withEngineTracking({ engineId: ENGINE_IDS.CAMPAIGN, caseId: 0 }, () => createCampaign(input));
    }),

  // Get single campaign
  get: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input }) => {
      return getCampaign(input.id);
    }),

  // List campaigns
  list: protectedProcedure
    .input(z.object({
      status: z.string().optional(),
      jurisdiction: z.string().optional(),
      stage: z.number().optional(),
      limit: z.number().optional(),
    }).optional())
    .query(async ({ input }) => {
      return listCampaigns(input || undefined);
    }),

  // Full campaign detail
  detail: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input }) => {
      return getCampaignDetail(input.id);
    }),

  // Advance stage
  advanceStage: protectedProcedure
    .input(z.object({
      campaignId: z.string(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      return withEngineTracking({ engineId: ENGINE_IDS.CAMPAIGN, caseId: 0 }, () => advanceCampaignStage(input.campaignId, input.notes));
    }),

  // Link reform package
  linkReformPackage: protectedProcedure
    .input(z.object({
      campaignId: z.string(),
      reformPackageId: z.string(),
    }))
    .mutation(async ({ input }) => {
      return withEngineTracking({ engineId: ENGINE_IDS.CAMPAIGN, caseId: 0 }, async () => {
        await linkReformPackage(input.campaignId, input.reformPackageId);
        return { success: true };
      });
    }),

  // Coalition members
  addMember: protectedProcedure
    .input(z.object({
      campaignId: z.string(),
      memberType: z.string(),
      memberId: z.string(),
      memberName: z.string(),
      roleInCoalition: z.string().optional(),
      commitmentLevel: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      return withEngineTracking({ engineId: ENGINE_IDS.CAMPAIGN, caseId: 0 }, async () => {
        const id = await addCoalitionMember(input);
        return { id };
      });
    }),

  getMembers: protectedProcedure
    .input(z.object({ campaignId: z.string() }))
    .query(async ({ input }) => {
      return getCoalitionMembers(input.campaignId);
    }),

  // Campaign targets
  addTarget: protectedProcedure
    .input(z.object({
      campaignId: z.string(),
      targetType: z.string(),
      targetId: z.string(),
      targetName: z.string(),
      priority: z.string().optional(),
      strategyNotes: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      return withEngineTracking({ engineId: ENGINE_IDS.CAMPAIGN, caseId: 0 }, async () => {
        const id = await addCampaignTarget(input);
        return { id };
      });
    }),

  getTargets: protectedProcedure
    .input(z.object({ campaignId: z.string() }))
    .query(async ({ input }) => {
      return getCampaignTargets(input.campaignId);
    }),

  updateTargetStatus: protectedProcedure
    .input(z.object({
      targetId: z.string(),
      status: z.string(),
      response: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      return withEngineTracking({ engineId: ENGINE_IDS.CAMPAIGN, caseId: 0 }, async () => {
        await updateTargetStatus(input.targetId, input.status, input.response);
        return { success: true };
      });
    }),

  // Actions
  logAction: protectedProcedure
    .input(z.object({
      campaignId: z.string(),
      stageNumber: z.number(),
      action: z.string(),
      responsibleParty: z.string(),
      responsiblePartyType: z.string(),
      impactScore: z.number().optional(),
      result: z.string().optional(),
      source: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      return withEngineTracking({ engineId: ENGINE_IDS.CAMPAIGN, caseId: 0 }, async () => {
        const id = await logAction(input);
        return { id };
      });
    }),

  getActions: protectedProcedure
    .input(z.object({
      campaignId: z.string(),
      stageNumber: z.number().optional(),
    }))
    .query(async ({ input }) => {
      return getCampaignActions(input.campaignId, input.stageNumber);
    }),

  // Outcomes
  recordOutcome: protectedProcedure
    .input(z.object({
      campaignId: z.string(),
      result: z.string(),
      impactScore: z.number().optional(),
      notes: z.string().optional(),
      policyChangeId: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      return withEngineTracking({ engineId: ENGINE_IDS.CAMPAIGN, caseId: 0 }, async () => {
        const id = await recordOutcome(input);
        return { id };
      });
    }),

  getOutcomes: protectedProcedure
    .input(z.object({ campaignId: z.string() }))
    .query(async ({ input }) => {
      return getCampaignOutcomes(input.campaignId);
    }),

  // Dashboard
  dashboard: protectedProcedure
    .query(async () => {
      return getCampaignDashboard();
    }),

  // Stage definitions
  stages: protectedProcedure
    .query(async () => {
      return CAMPAIGN_STAGES;
    }),
});
