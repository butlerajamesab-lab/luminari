import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import {
  validateClaim,
  analyzeCaseEvidence,
  getClaimValidationDashboard,
  getAvailableClaimTypesForValidation,
  getClaimElements,
} from "../claim-validation-engine-service";

const evidenceItemSchema = z.object({
  type: z.string(),
  description: z.string().optional(),
});

export const claimValidationRouter = router({
  // Validate a single claim type
  validate: protectedProcedure
    .input(z.object({
      claimType: z.string(),
      evidence: z.array(evidenceItemSchema),
    }))
    .mutation(async ({ input }) => {
      return validateClaim(input.claimType, input.evidence);
    }),

  // Full case analysis across multiple claim types
  analyzeCase: protectedProcedure
    .input(z.object({
      claimTypes: z.array(z.string()),
      evidence: z.array(evidenceItemSchema),
    }))
    .mutation(async ({ input }) => {
      return analyzeCaseEvidence(input.claimTypes, input.evidence);
    }),

  // Dashboard
  dashboard: protectedProcedure.query(async () => {
    return getClaimValidationDashboard();
  }),

  // Available claim types
  claimTypes: protectedProcedure.query(async () => {
    return getAvailableClaimTypesForValidation();
  }),

  // Get elements for a claim type
  elements: protectedProcedure
    .input(z.object({ claimType: z.string() }))
    .query(async ({ input }) => {
      return getClaimElements(input.claimType);
    }),
});
