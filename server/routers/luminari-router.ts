/**
 * Luminari Router
 * 
 * Thin wrapper around service layer
 * All business logic delegated to services
 * 
 * Services:
 * - registryService (read-only Registry DB)
 * - caseService (read/write Case DB)
 * - matchingService (composition)
 */

import { router, publicProcedure, protectedProcedure } from "../_core/trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import * as matchingService from "../services/matchingService";
import * as registryService from "../services/registryService";
import * as caseService from "../services/caseService";
import { createTemporaryProtectedProcedure, isTemporaryBypassEnabled } from "../_core/temp-bypass-procedure";

// Use temporary protected procedure for development validation
const tempProtectedProcedure = isTemporaryBypassEnabled() 
  ? createTemporaryProtectedProcedure(protectedProcedure)
  : protectedProcedure;

export const luminariRouter = router({
  /**
   * Get all jurisdictions
   */
  jurisdictions: publicProcedure.query(async () => {
    try {
      return await registryService.getJurisdictions();
    } catch (err) {
      console.error("Error fetching jurisdictions:", err);
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to fetch jurisdictions",
      });
    }
  }),

  /**
   * Process intake: create case + match registry
   * 
   * Flow:
   * 1. Create case in Case DB
   * 2. Query Registry DB for match
   * 3. Return composed response
   */
  processIntake: tempProtectedProcedure
    .input(
      z.object({
        jurisdiction_id: z.number(),
        category: z.string(),
        intake_answers: z.record(z.any()).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        const response = await matchingService.processIntake({
          user_id: ctx.user?.id ? parseInt(ctx.user.id.toString()) : null,
          jurisdiction_id: input.jurisdiction_id,
          category: input.category,
          intake_answers: input.intake_answers || {},
        });

        return response;
      } catch (err: any) {
        console.error("Error processing intake:", err);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: err.message || "Failed to process intake",
        });
      }
    }),

  /**
   * Get case with registry context
   */
  getCase: tempProtectedProcedure
    .input(z.object({ case_id: z.number() }))
    .query(async ({ input }) => {
      try {
        return await matchingService.getCaseWithContext(input.case_id);
      } catch (err: any) {
        console.error("Error getting case:", err);
        throw new TRPCError({
          code: "NOT_FOUND",
          message: err.message || "Case not found",
        });
      }
    }),

  /**
   * Record action on case
   */
  recordAction: protectedProcedure
    .input(
      z.object({
        case_id: z.number(),
        type: z.string(),
        description: z.string(),
      })
    )
    .mutation(async ({ input }) => {
      try {
        await matchingService.recordAction(
          input.case_id,
          input.type,
          input.description
        );
        return { success: true };
      } catch (err: any) {
        console.error("Error recording action:", err);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: err.message || "Failed to record action",
        });
      }
    }),

  /**
   * Add note to case
   */
  addNote: protectedProcedure
    .input(
      z.object({
        case_id: z.number(),
        note: z.string(),
      })
    )
    .mutation(async ({ input }) => {
      try {
        await matchingService.addNote(input.case_id, input.note);
        return { success: true };
      } catch (err: any) {
        console.error("Error adding note:", err);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: err.message || "Failed to add note",
        });
      }
    }),

  /**
   * Request case expungement
   */
  requestExpungement: protectedProcedure
    .input(z.object({ case_id: z.number() }))
    .mutation(async ({ input }) => {
      try {
        await matchingService.requestExpungement(input.case_id);
        return { success: true };
      } catch (err: any) {
        console.error("Error requesting expungement:", err);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: err.message || "Failed to request expungement",
        });
      }
    }),

  /**
   * Get programs for jurisdiction
   */
  getPrograms: publicProcedure
    .input(z.object({ jurisdiction_id: z.number() }))
    .query(async ({ input }) => {
      try {
        return await registryService.getJurisdictionPrograms(
          input.jurisdiction_id
        );
      } catch (err) {
        console.error("Error fetching programs:", err);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to fetch programs",
        });
      }
    }),

  /**
   * Get workflows for jurisdiction
   */
  getWorkflows: publicProcedure
    .input(z.object({ jurisdiction_id: z.number() }))
    .query(async ({ input }) => {
      try {
        return await registryService.getJurisdictionWorkflows(
          input.jurisdiction_id
        );
      } catch (err) {
        console.error("Error fetching workflows:", err);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to fetch workflows",
        });
      }
    }),

  /**
   * Get entities for jurisdiction
   */
  getEntities: publicProcedure
    .input(z.object({ jurisdiction_id: z.number() }))
    .query(async ({ input }) => {
      try {
        return await registryService.getJurisdictionEntities(
          input.jurisdiction_id
        );
      } catch (err) {
        console.error("Error fetching entities:", err);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to fetch entities",
        });
      }
    }),

  /**
   * Get signals for jurisdiction
   */
  getSignals: publicProcedure
    .input(z.object({ jurisdiction_id: z.number() }))
    .query(async ({ input }) => {
      try {
        return await registryService.getJurisdictionSignals(
          input.jurisdiction_id
        );
      } catch (err) {
        console.error("Error fetching signals:", err);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to fetch signals",
        });
      }
    }),

  /**
   * Search programs
   */
  searchPrograms: publicProcedure
    .input(
      z.object({
        query: z.string(),
        jurisdiction_id: z.number().optional(),
      })
    )
    .query(async ({ input }) => {
      try {
        return await registryService.searchPrograms(
          input.query,
          input.jurisdiction_id
        );
      } catch (err) {
        console.error("Error searching programs:", err);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to search programs",
        });
      }
    }),
});
