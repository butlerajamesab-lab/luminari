/**
 * Engines V3 Router (Session 73)
 *
 * Exposes tRPC endpoints for:
 * - Systemic Simulation Engine
 * - Public Transparency Layer
 * - Evidence Publishing & Dossier Engine
 * - External Collaboration & Secure Sharing Engine
 */

import { z } from "zod";
import { router, protectedProcedure, adminProcedure } from "../_core/trpc";
import { withEngineTracking, ENGINE_IDS } from "../engine-entrypoint-wrapper";

export const enginesV3Router = router({
  // ═══════════════════════════════════════════
  // Systemic Simulation Engine
  // ═══════════════════════════════════════════

  simulationStats: protectedProcedure.query(async () => {
    const { getSimulationStats } = await import("../engines/systemic-simulation");
    return getSimulationStats();
  }),

  runSimulation: protectedProcedure
    .input(z.object({
      simulationType: z.enum(["policy_change", "enforcement_increase", "penalty_adjustment", "staffing_change", "jurisdiction_reform"]),
      targetIndustry: z.string().optional(),
      targetEntity: z.string().optional(),
      jurisdiction: z.string().optional(),
      parameters: z.record(z.string(), z.number()),
      description: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      return withEngineTracking({ engineId: ENGINE_IDS.SYSTEMIC_SIMULATION, caseId: 0 }, async () => {
        const { runSimulation } = await import("../engines/systemic-simulation");
        return runSimulation({
          ...input,
          createdBy: ctx.user?.name ?? "system",
        } as any);
      });
    }),

  simulationHistory: protectedProcedure
    .input(z.object({
      simulationType: z.string().optional(),
      industry: z.string().optional(),
      limit: z.number().optional(),
      offset: z.number().optional(),
    }).optional())
    .query(async ({ input }) => {
      const { listSimulations } = await import("../engines/systemic-simulation") as any;
      return listSimulations(input);
    }),

  simulationDetail: protectedProcedure
    .input(z.object({ simulationId: z.number() }))
    .query(async ({ input }) => {
      const { getSimulationById } = await import("../engines/systemic-simulation");
      return getSimulationById(input.simulationId);
    }),

  compareSimulations: protectedProcedure
    .input(z.object({ simulationIds: z.array(z.number()).min(2).max(5) }))
    .query(async ({ input }) => {
      const { compareSimulations } = await import("../engines/systemic-simulation") as any;
      return compareSimulations(input.simulationIds);
    }),

  simulationReport: protectedProcedure
    .input(z.object({ simulationId: z.number() }))
    .query(async ({ input }) => {
      const { generateSimulationReport } = await import("../engines/systemic-simulation");
      return generateSimulationReport(input.simulationId);
    }),

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
  // Evidence Publishing & Dossier Engine
  // ═══════════════════════════════════════════

  dossierStats: protectedProcedure.query(async () => {
    const { getDossierStats } = await import("../engines/evidence-dossier");
    return getDossierStats();
  }),

  generateDossier: protectedProcedure
    .input(z.object({
      dossierType: z.enum(["investigation_kit", "legal_bundle", "policy_packet", "regulator_referral", "entity_dossier", "pattern_dossier"]),
      patternId: z.number().optional(),
      patternName: z.string().optional(),
      entityId: z.number().optional(),
      entityName: z.string().optional(),
      jurisdiction: z.string().optional(),
      audienceType: z.enum(["journalist", "attorney", "policymaker", "regulator", "advocate", "internal"]),
      signalCount: z.number().optional(),
      complaintCount: z.number().optional(),
      litigationCount: z.number().optional(),
      enforcementCount: z.number().optional(),
      entityNames: z.array(z.string()).optional(),
      institutionNames: z.array(z.string()).optional(),
      pressureIndex: z.number().optional(),
      accountabilityScore: z.number().optional(),
      enforcementGap: z.number().optional(),
      crisisProbability: z.number().optional(),
      trendClassification: z.string().optional(),
      topSignals: z.array(z.object({ title: z.string(), severity: z.number(), date: z.string() })).optional(),
      relatedPatterns: z.array(z.object({ name: z.string(), pressureIndex: z.number() })).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      return withEngineTracking({ engineId: ENGINE_IDS.EVIDENCE_DOSSIER, caseId: 0 }, async () => {
        const mod = await import("../engines/evidence-dossier");
        const dossierInput = { ...input, createdBy: ctx.user?.name ?? "system" };
        switch (input.dossierType) {
          case "investigation_kit": return mod.generateInvestigationKit(dossierInput);
          case "legal_bundle": return mod.generateLegalBundle(dossierInput);
          case "policy_packet": return mod.generatePolicyPacket(dossierInput);
          case "regulator_referral": return mod.generateRegulatorReferral(dossierInput);
          case "entity_dossier": return mod.generateEntityDossier(dossierInput);
          case "pattern_dossier": return mod.generatePatternDossier(dossierInput);
          default: return mod.generateInvestigationKit(dossierInput);
        }
      });
    }),

  dossierDetail: protectedProcedure
    .input(z.object({ dossierId: z.number() }))
    .query(async ({ input }) => {
      const { getDossierById } = await import("../engines/evidence-dossier");
      return getDossierById(input.dossierId);
    }),

  exportDossier: protectedProcedure
    .input(z.object({
      dossierId: z.number(),
      format: z.enum(["markdown", "html", "json"]).optional(),
    }))
    .query(async ({ input }) => {
      const { exportDossier } = await import("../engines/evidence-dossier");
      return { content: await exportDossier(input.dossierId, input.format ?? "markdown") };
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
