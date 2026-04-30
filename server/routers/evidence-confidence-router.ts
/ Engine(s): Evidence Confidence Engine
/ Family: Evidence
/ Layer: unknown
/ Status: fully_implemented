import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import {
  calculateEvidenceConfidence,
  determineStrategyPath,
  recommendRemedy,
  analyzeEvidenceConfidence,
  getEvidenceConfidenceDashboard,
  getAvailableClaimTypes,
  getEvidenceRuleDetail,
} from "../evidence-confidence-engine-service";

const evidenceItemSchema = z.object({
  type: z.string(),
  description: z.string().optional(),
  source: z.enum(["first_party", "third_party", "government", "employer", "other"]).optional(),
  has_contradictions: z.boolean().optional(),
  corroborated: z.boolean().optional(),
});

export const evidenceConfidenceRouter = router({
  // Full analysis: scoring + pathfinding + remedy
  analyze: protectedProcedure
    .input(z.object({
      claimType: z.string(),
      evidence: z.array(evidenceItemSchema),
    }))
    .mutation(async ({ input }) => {
      return analyzeEvidenceConfidence(input.claimType, input.evidence);
    }),

  // Score only
  calculateScore: protectedProcedure
    .input(z.object({
      claimType: z.string(),
      evidence: z.array(evidenceItemSchema),
    }))
    .mutation(async ({ input }) => {
      return calculateEvidenceConfidence(input.claimType, input.evidence);
    }),

  // Strategy path from score
  getStrategyPath: protectedProcedure
    .input(z.object({
      claimType: z.string(),
      confidenceScore: z.number(),
      evidenceGaps: z.array(z.string()),
    }))
    .query(async ({ input }) => {
      return determineStrategyPath(input.claimType, input.confidenceScore, input.evidenceGaps);
    }),

  // Remedy recommendation from score
  getRemedy: protectedProcedure
    .input(z.object({
      confidenceScore: z.number(),
      claimType: z.string(),
    }))
    .query(async ({ input }) => {
      return recommendRemedy(input.confidenceScore, input.claimType);
    }),

  // Dashboard
  dashboard: protectedProcedure.query(async () => {
    return getEvidenceConfidenceDashboard();
  }),

  // Available claim types
  claimTypes: protectedProcedure.query(async () => {
    return getAvailableClaimTypes();
  }),

  // Rule detail
  ruleDetail: protectedProcedure
    .input(z.object({ claimType: z.string() }))
    .query(async ({ input }) => {
      return getEvidenceRuleDetail(input.claimType);
    }),
});
