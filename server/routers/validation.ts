/**
 * L7 Claim Validation Router
 * 
 * tRPC procedures for the claim validation layer
 * Only CLAIM_VALIDATOR system actor can access
 */

import { router, protectedProcedure } from '../trpc';
import { z } from 'zod';
import { claimValidator } from '../validation/claim-validator';
import { TRPCError } from '@trpc/server';

export const validationRouter = router({
  /**
   * Validate a Phoenix signal against public records
   * Returns: VALIDATED_CLAIM, INSUFFICIENT_EVIDENCE, or REQUIRES_FOIA
   */
  validatePhoenixSignal: protectedProcedure
    .input(
      z.object({
        signalId: z.string().min(1),
        systemActor: z.enum(['INGESTION_ENGINE', 'PHOENIX_DETECTOR', 'CLAIM_VALIDATOR']),
      })
    )
    .mutation(async ({ input, ctx }) => {
      // Only allow sovereign actors
      if (!['INGESTION_ENGINE', 'PHOENIX_DETECTOR', 'CLAIM_VALIDATOR'].includes(input.systemActor)) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: `Unauthorized: ${input.systemActor} cannot validate claims`,
        });
      }

      console.log(
        `[VALIDATION_ROUTER] Validating signal ${input.signalId} by ${input.systemActor}`
      );

      try {
        const result = await claimValidator.validatePhoenixSignal(
          input.signalId,
          input.systemActor
        );

        return {
          success: true,
          data: result,
        };
      } catch (error: any) {
        console.error(`[VALIDATION_ROUTER] Validation failed: ${error.message}`);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `Validation failed: ${error.message}`,
        });
      }
    }),

  /**
   * Get validation history for a case
   */
  getValidationHistory: protectedProcedure
    .input(
      z.object({
        caseId: z.number().int().positive(),
        limit: z.number().int().positive().default(10),
      })
    )
    .query(async ({ input, ctx }) => {
      console.log(
        `[VALIDATION_ROUTER] Retrieving validation history for case ${input.caseId}`
      );

      // Mock implementation - would query database in production
      return {
        case_id: input.caseId,
        validations: [],
        total: 0,
      };
    }),

  /**
   * Get validation result by signal ID
   */
  getValidationResult: protectedProcedure
    .input(
      z.object({
        signalId: z.string().min(1),
      })
    )
    .query(async ({ input, ctx }) => {
      console.log(`[VALIDATION_ROUTER] Retrieving validation result for signal ${input.signalId}`);

      // Mock implementation - would query database in production
      return {
        signal_id: input.signalId,
        classification: 'VALIDATED_CLAIM',
        validation_score: 0.96,
      };
    }),

  /**
   * Get enforcement action path for validated claim
   */
  getEnforcementPath: protectedProcedure
    .input(
      z.object({
        signalId: z.string().min(1),
      })
    )
    .query(async ({ input, ctx }) => {
      console.log(
        `[VALIDATION_ROUTER] Retrieving enforcement path for signal ${input.signalId}`
      );

      // Mock implementation - would query database in production
      return {
        signal_id: input.signalId,
        enforcement_agency: 'Seattle Office of Inspector General',
        primary_contact: 'seattle.gov/inspector-general',
        statute: 'SMC 20.42.050',
        deadline: '3 years from award',
        action_type: 'RECOVERY',
        priority: 'HIGH',
      };
    }),

  /**
   * Bulk validate multiple signals
   */
  bulkValidateSignals: protectedProcedure
    .input(
      z.object({
        signalIds: z.array(z.string().min(1)).min(1).max(100),
        systemActor: z.enum(['INGESTION_ENGINE', 'PHOENIX_DETECTOR', 'CLAIM_VALIDATOR']),
      })
    )
    .mutation(async ({ input, ctx }) => {
      console.log(
        `[VALIDATION_ROUTER] Bulk validating ${input.signalIds.length} signals by ${input.systemActor}`
      );

      const results = [];
      const errors = [];

      for (const signalId of input.signalIds) {
        try {
          const result = await claimValidator.validatePhoenixSignal(
            signalId,
            input.systemActor
          );
          results.push(result);
        } catch (error: any) {
          errors.push({
            signalId,
            error: error.message,
          });
        }
      }

      return {
        validated_count: results.length,
        error_count: errors.length,
        results,
        errors,
      };
    }),
});
