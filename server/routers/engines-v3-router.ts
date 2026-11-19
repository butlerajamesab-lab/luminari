/**
 * Engines V3 Router (Session 73)
 *
 * Exposes tRPC endpoints for:
 * - Public Transparency Layer
 * - External Collaboration & Secure Sharing Engine
 *
 * The Systemic Simulation and Evidence Publishing & Dossier sections
 * were removed with their Mission Control panels in the Gate A
 * removal (2026-11-19).
 */

import { z } from "zod";
import { router, protectedProcedure, adminProcedure } from "../_core/trpc";
import { withEngineTracking, ENGINE_IDS } from "../engine-entrypoint-wrapper";

export const enginesV3Router = router({
  // ═══════════════════════════════════════════
  // Public Transparency Layer
  // ═══════════════════════════════════════════

  transparencyStats: protectedProcedure.query(async () => {
    const { getTransparencyStats } = await import("../engines/public-transparency");
    return getTransparencyStats();
  }),

  generateExplainer: protectedProcedure
    .input(z.object({
      patternId: z.number().optional(),
      patternName: z.string().optional(),
      entityName: z.string().optional(),
      jurisdiction: z.string().optional(),
      signalCount: z.number().optional(),
      complaintCount: z.number().optional(),
      pressureIndex: z.number().optional(),
      trendClassification: z.string().optional(),
      audienceLevel: z.enum(["general_public", "affected_community", "journalist", "policymaker"]).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      return withEngineTracking({ engineId: ENGINE_IDS.TRANSPARENCY, caseId: 0 }, async () => {
        const { generatePatternExplainer } = await import("../engines/public-transparency");
        return generatePatternExplainer({
          ...input,
          createdBy: ctx.user?.name ?? "system",
        } as any);
      });
    }),

  generateBrief: protectedProcedure
    .input(z.object({
      briefType: z.enum(["accountability_report", "crisis_warning", "enforcement_gap_brief", "industry_overview"]),
      industry: z.string().optional(),
      jurisdiction: z.string().optional(),
      entityNames: z.array(z.string()).optional(),
      institutionNames: z.array(z.string()).optional(),
      signalCount: z.number().optional(),
      complaintCount: z.number().optional(),
      enforcementCount: z.number().optional(),
      enforcementGap: z.number().optional(),
      accountabilityScore: z.number().optional(),
      crisisProbability: z.number().optional(),
      pressureIndex: z.number().optional(),
      trendClassification: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      return withEngineTracking({ engineId: ENGINE_IDS.TRANSPARENCY, caseId: 0 }, async () => {
        const { generatePublicBrief } = await import("../engines/public-transparency") as any;
        return generatePublicBrief({
          ...input,
          createdBy: ctx.user?.name ?? "system",
        });
      });
    }),

  transparencyDocuments: protectedProcedure
    .input(z.object({
      documentType: z.string().optional(),
      audienceLevel: z.string().optional(),
      limit: z.number().optional(),
      offset: z.number().optional(),
    }).optional())
    .query(async ({ input }) => {
      const { listTransparencyDocuments } = await import("../engines/public-transparency") as any;
      return listTransparencyDocuments(input);
    }),

  transparencyDocument: protectedProcedure
    .input(z.object({ documentId: z.number() }))
    .query(async ({ input }) => {
      const { getTransparencyDocumentById } = await import("../engines/public-transparency") as any;
      return getTransparencyDocumentById(input.documentId);
    }),

  translateJargon: protectedProcedure
    .input(z.object({ text: z.string() }))
    .query(async ({ input }) => {
      const { translateJargon } = await import("../engines/public-transparency");
      return { translated: translateJargon(input.text) };
    }),

  // ═══════════════════════════════════════════
  // External Collaboration & Secure Sharing
  // ═══════════════════════════════════════════

  collaborationStats: protectedProcedure.query(async () => {
    const { getCollaborationStats } = await import("../engines/external-collaboration");
    return getCollaborationStats();
  }),

  registerPartner: protectedProcedure
    .input(z.object({
      name: z.string(),
      organization: z.string().optional(),
      partnerType: z.enum(["journalist", "attorney", "regulator", "advocate", "researcher", "other"]),
      email: z.string().optional(),
      jurisdiction: z.string().optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      return withEngineTracking({ engineId: ENGINE_IDS.COLLABORATION, caseId: 0 }, async () => {
        const { registerPartner } = await import("../engines/external-collaboration");
        return registerPartner(input);
      });
    }),

  verifyPartner: adminProcedure
    .input(z.object({ partnerId: z.number() }))
    .mutation(async ({ input }) => {
      return withEngineTracking({ engineId: ENGINE_IDS.COLLABORATION, caseId: 0 }, async () => {
        const { verifyPartner } = await import("../engines/external-collaboration");
        await verifyPartner(input.partnerId);
        return { success: true };
      });
    }),

  listPartners: protectedProcedure
    .input(z.object({
      type: z.enum(["journalist", "attorney", "regulator", "advocate", "researcher", "other"]).optional(),
      status: z.string().optional(),
    }).optional())
    .query(async ({ input }) => {
      const { listPartners } = await import("../engines/external-collaboration");
      return listPartners(input);
    }),

  createShare: protectedProcedure
    .input(z.object({
      dossierId: z.number(),
      partnerId: z.number(),
      accessLevel: z.enum(["view_only", "view_download", "view_comment", "full_access"]).optional(),
      expiresInDays: z.number().optional(),
    }))
    .mutation(async ({ input }) => {
      return withEngineTracking({ engineId: ENGINE_IDS.COLLABORATION, caseId: 0 }, async () => {
        const { createShare } = await import("../engines/external-collaboration");
        return createShare(input);
      });
    }),

  revokeShare: protectedProcedure
    .input(z.object({ shareId: z.number() }))
    .mutation(async ({ input }) => {
      return withEngineTracking({ engineId: ENGINE_IDS.COLLABORATION, caseId: 0 }, async () => {
        const { revokeShare } = await import("../engines/external-collaboration");
        await revokeShare(input.shareId);
        return { success: true };
      });
    }),

  validateShareToken: protectedProcedure
    .input(z.object({ token: z.string() }))
    .query(async ({ input }) => {
      const { validateShareToken } = await import("../engines/external-collaboration");
      return validateShareToken(input.token);
    }),

  shareAccessLog: protectedProcedure
    .input(z.object({ shareId: z.number() }))
    .query(async ({ input }) => {
      const { getAccessLog } = await import("../engines/external-collaboration");
      return getAccessLog(input.shareId);
    }),

  sharesForDossier: protectedProcedure
    .input(z.object({ dossierId: z.number() }))
    .query(async ({ input }) => {
      const { listSharesForDossier } = await import("../engines/external-collaboration");
      return listSharesForDossier(input.dossierId);
    }),

  addComment: protectedProcedure
    .input(z.object({
      shareId: z.number(),
      partnerId: z.number(),
      commentText: z.string(),
      sectionId: z.number().optional(),
    }))
    .mutation(async ({ input }) => {
      const { addComment } = await import("../engines/external-collaboration");
      await addComment(input.shareId, input.partnerId, input.commentText, input.sectionId);
      return { success: true };
    }),

  shareComments: protectedProcedure
    .input(z.object({ shareId: z.number() }))
    .query(async ({ input }) => {
      const { getCommentsForShare } = await import("../engines/external-collaboration");
      return getCommentsForShare(input.shareId);
    }),

  addRedaction: protectedProcedure
    .input(z.object({
      dossierId: z.number(),
      sectionId: z.number().optional(),
      redactedText: z.string(),
      reason: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const { addRedaction } = await import("../engines/external-collaboration");
      await addRedaction({ ...input, createdBy: ctx.user?.name ?? "system" });
      return { success: true };
    }),

  dossierRedactions: protectedProcedure
    .input(z.object({ dossierId: z.number() }))
    .query(async ({ input }) => {
      const { getRedactionsForDossier } = await import("../engines/external-collaboration");
      return getRedactionsForDossier(input.dossierId);
    }),
});
