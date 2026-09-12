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
import { case_context_input, case_action_context_input } from "../case-context-boundary";
import * as matchingService from "../services/matchingService";
import * as registryService from "../services/registryService";
import * as caseService from "../services/caseService";
import * as luminari_context_service from "../services/luminariContextService";

function luminari_read_error(err: unknown, fallback_message: string) {
  if (err instanceof TRPCError) return err;
  const message = err instanceof Error && err.message
    ? err.message
    : fallback_message;
  return new TRPCError({
    code: /(?:^case \d+ not found$)|(?:^jurisdiction \d+ not found in registry$)/i.test(message)
      ? "NOT_FOUND"
      : "INTERNAL_SERVER_ERROR",
    message,
  });
}

const get_context_procedure = protectedProcedure
  .input(case_context_input)
  .query(async ({ ctx, input }) => {
    try {
      return await luminari_context_service.get_case_context(input.case_id, ctx.user.id);
    } catch (err) {
      throw luminari_read_error(err, "Failed to fetch case context");
    }
  });

const get_action_context_procedure = protectedProcedure
  .input(case_action_context_input)
  .query(async ({ ctx, input }) => {
    try {
      return await luminari_context_service.get_case_action_context({ ...input, user_id: ctx.user.id });
    } catch (err) {
      throw luminari_read_error(err, "Failed to fetch case action context");
    }
  });

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
  processIntake: protectedProcedure
    .input(
      z.object({
        jurisdiction_id: z.number(),
        category: z.string(),
        // @ts-ignore
        intake_answers: z.record(z.string(), z.any()).optional(),
      })
    )
    // @ts-ignore
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
  getCase: protectedProcedure
    .input(z.object({ case_id: z.number() }))
    // @ts-ignore
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
        return await registryService.getPrograms(
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
        return await registryService.getWorkflowSteps(
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
        return await registryService.getWorkflowSteps(
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
        return await registryService.getJurisdictions(
          // @ts-ignore
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

  /**
   * SUNAM INTEGRATION ENDPOINTS
   * 
   * Unified context endpoint for Sunam
   * No direct SQL access - all through service layer
   */

  /**
   * Get unified context for a case (Sunam read endpoint)
   * 
   * Returns:
   * - case data
   * - jurisdiction
   * - workflows
   * - programs
   * - entities
   * - signals
   * - legal_library
   * - enforcement_pathways
   * - deadlines
   * - diagnostics
   */
  get_context: get_context_procedure,
  get_action_context: get_action_context_procedure,
  // Legacy HTTP paths remain input aliases for the same normalized procedures.
  getContext: get_context_procedure,
  getActionContext: get_action_context_procedure,

  /**
   * Record validation result (Sunam write endpoint)
   * 
   * Called by Sunam after validation
   */
  recordValidation: protectedProcedure
    .input(
      z.object({
        case_id: z.number(),
        validation_type: z.string(),
        result: z.string(),
        confidence_score: z.number().optional(),
        notes: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      try {
        await luminari_context_service.recordValidationResult(input.case_id, {
          validation_type: input.validation_type,
          result: input.result,
          confidence_score: input.confidence_score,
          notes: input.notes,
        });
        return { success: true, message: "Validation recorded" };
      } catch (err: any) {
        console.error("Error recording validation:", err);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: err.message || "Failed to record validation",
        });
      }
    }),

  /**
   * Record reconciliation result (Sunam write endpoint)
   * 
   * Called by Sunam after reconciliation
   */
  recordReconciliation: protectedProcedure
    .input(
      z.object({
        case_id: z.number(),
        run_id: z.string(),
        total_rows: z.number(),
        discrepancy_count: z.number(),
        status: z.string(),
        notes: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      try {
        await luminari_context_service.recordReconciliation(input.case_id, {
          run_id: input.run_id,
          total_rows: input.total_rows,
          discrepancy_count: input.discrepancy_count,
          status: input.status,
          notes: input.notes,
        });
        return { success: true, message: "Reconciliation recorded" };
      } catch (err: any) {
        console.error("Error recording reconciliation:", err);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: err.message || "Failed to record reconciliation",
        });
      }
    }),
});
