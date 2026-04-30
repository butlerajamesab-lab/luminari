/**
 * Knowledge Backbone Router
 * 
 * Exposes the 7 knowledge backbone modules to the frontend and reasoning engine.
 * Read-only access — does not modify interpretation packs or signal engine.
 */

import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import {
  listModules,
  getModule,
  getEntriesByModule,
  getEntryById,
  searchEntries,
  getCrossRefs,
  getRelatedEntries,
  lookupClaim,
  routeToAgency,
  checkSOLCollision,
  getCascadePathways,
  findGaps,
  getConfidenceEngineSpec,
  getPolicyEvents,
  getBackboneSummary,
  type ModuleType,
} from "../knowledge-backbone";

export const knowledgeBackboneRouter = router({
  /** List all active backbone modules with entry counts */
  summary: protectedProcedure.query(async () => {
    return getBackboneSummary();
  }),

  /** List all modules */
  listModules: protectedProcedure.query(async () => {
    return listModules();
  }),

  /** Get entries for a specific module with optional filters */
  getEntries: protectedProcedure
    .input(z.object({
      moduleType: z.string(),
      category: z.string().optional(),
      severity: z.string().optional(),
      domain: z.string().optional(),
      limit: z.number().optional(),
      offset: z.number().optional(),
    }))
    .query(async ({ input }) => {
      return getEntriesByModule(input.moduleType as ModuleType, input);
    }),

  /** Get a single entry by ID */
  getEntry: protectedProcedure
    .input(z.object({ entryId: z.string() }))
    .query(async ({ input }) => {
      return getEntryById(input.entryId);
    }),

  /** Search across all modules */
  search: protectedProcedure
    .input(z.object({
      query: z.string().min(1),
      moduleTypes: z.array(z.string()).optional(),
      limit: z.number().optional(),
    }))
    .query(async ({ input }) => {
      return searchEntries(input.query, {
        moduleTypes: input.moduleTypes as ModuleType[],
        limit: input.limit,
      });
    }),

  /** Get cross-references for a module */
  crossRefs: protectedProcedure
    .input(z.object({ moduleType: z.string() }))
    .query(async ({ input }) => {
      return getCrossRefs(input.moduleType as ModuleType);
    }),

  /** Get related entries for a specific entry */
  relatedEntries: protectedProcedure
    .input(z.object({ entryId: z.string() }))
    .query(async ({ input }) => {
      return getRelatedEntries(input.entryId);
    }),

  // ─── Specialized Queries ────────────────────────────────────

  /** Look up claim types from the Claim Catalog */
  lookupClaim: protectedProcedure
    .input(z.object({ query: z.string() }))
    .query(async ({ input }) => {
      return lookupClaim(input.query);
    }),

  /** Route a claim type to the appropriate federal agency */
  routeToAgency: protectedProcedure
    .input(z.object({ claimType: z.string() }))
    .query(async ({ input }) => {
      return routeToAgency(input.claimType);
    }),

  /** Check SOL collision scenarios */
  checkSOLCollision: protectedProcedure
    .input(z.object({ category: z.string() }))
    .query(async ({ input }) => {
      return checkSOLCollision(input.category);
    }),

  /** Get benefits cascade pathways */
  cascadePathways: protectedProcedure
    .input(z.object({ trigger: z.string().optional() }))
    .query(async ({ input }) => {
      return getCascadePathways(input.trigger);
    }),

  /** Find no-remedy gaps */
  findGaps: protectedProcedure
    .input(z.object({ category: z.string().optional() }))
    .query(async ({ input }) => {
      return findGaps(input.category);
    }),

  /** Get confidence engine specification */
  confidenceSpec: protectedProcedure.query(async () => {
    return getConfidenceEngineSpec();
  }),

  /** Get policy events with optional filters */
  policyEvents: protectedProcedure
    .input(z.object({
      direction: z.string().optional(),
      type: z.string().optional(),
    }))
    .query(async ({ input }) => {
      return getPolicyEvents(input);
    }),
});
