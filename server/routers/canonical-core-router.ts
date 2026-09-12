/**
 * Canonical Core Router — current Lighthouse truth surface.
 *
 * Mission Control and explorer surfaces read the current reconciled civic-object
 * universe here, not legacy registry counts or manual world-node bookkeeping.
 */

import { z } from "zod";
import { router, publicProcedure, protectedProcedure } from "../_core/trpc";
import { getPool } from "../db";
import {
  getPipelineCompletionState,
  finalizePipelineRun,
} from "../services/canonical-core";
import {
  getCurrentCanonicalCoreHealth,
  getCurrentCanonicalState,
  getCurrentGraphEdges,
  getCurrentGraphNodes,
  getCurrentSystemSummary,
  getCurrentUnresolvedRelationships,
} from "../services/current-canonical-state";
import {
  readCurrentGraphEdgePage,
  readCurrentGraphNodePage,
  readCurrentUnresolvedRelationshipPage,
} from "../services/current-corpus-page-reader";
import { readCurrentDiscoveryFacts } from "../services/current-discovery-facts";
import { read_current_legal_authorities, read_current_legal_authority } from "../services/current-legal-authority-reader";
import { reconnectAllSectors } from "../services/knowledge-reconnect";

export const canonicalCoreRouter = router({
  health: publicProcedure.query(async () => {
    return getCurrentCanonicalCoreHealth();
  }),

  summary: publicProcedure.query(async () => {
    return getCurrentSystemSummary();
  }),

  currentState: publicProcedure.query(async () => {
    return getCurrentCanonicalState();
  }),

  // Compatibility samples retained for existing Mission Control consumers.
  // These limits are response-window limits only and must never be interpreted
  // as the size of the canonical graph universe.
  graphNodes: publicProcedure
    .input(z.object({
      limit: z.number().int().min(1).max(200).default(20),
      nodeType: z.string().trim().max(80).optional(),
    }).optional())
    .query(async ({ input }) => {
      return getCurrentGraphNodes(input ?? {});
    }),

  graphEdges: publicProcedure
    .input(z.object({
      limit: z.number().int().min(1).max(200).default(40),
      edgeType: z.string().trim().max(80).optional(),
      nodeId: z.string().trim().max(180).optional(),
      semanticOnly: z.boolean().default(false),
    }).optional())
    .query(async ({ input }) => {
      return getCurrentGraphEdges(input ?? {});
    }),

  unresolvedRelationships: publicProcedure
    .input(z.object({
      limit: z.number().int().min(1).max(200).default(40),
      relationshipType: z.string().trim().max(80).optional(),
    }).optional())
    .query(async ({ input }) => {
      return getCurrentUnresolvedRelationships(input ?? {});
    }),

  graphNodePage: publicProcedure
    .input(z.object({
      nodeType: z.string().trim().max(80).optional(),
      query: z.string().trim().max(240).optional(),
      limit: z.number().int().min(1).max(250).default(100),
      offset: z.number().int().min(0).default(0),
    }).optional())
    .query(async ({ input }) => readCurrentGraphNodePage(input ?? {})),

  graphEdgePage: publicProcedure
    .input(z.object({
      edgeType: z.string().trim().max(80).optional(),
      nodeId: z.string().trim().max(180).optional(),
      semanticOnly: z.boolean().default(false),
      limit: z.number().int().min(1).max(250).default(100),
      offset: z.number().int().min(0).default(0),
    }).optional())
    .query(async ({ input }) => readCurrentGraphEdgePage(input ?? {})),

  unresolvedRelationshipPage: publicProcedure
    .input(z.object({
      relationshipType: z.string().trim().max(80).optional(),
      limit: z.number().int().min(1).max(250).default(100),
      offset: z.number().int().min(0).default(0),
    }).optional())
    .query(async ({ input }) => readCurrentUnresolvedRelationshipPage(input ?? {})),

  discoveryFacts: publicProcedure
    .input(z.object({
      query: z.string().trim().max(240).optional(),
      category: z.string().trim().max(160).optional(),
      jurisdiction: z.string().trim().max(80).optional(),
      limit: z.number().int().min(1).max(100).default(60),
      offset: z.number().int().min(0).max(100_000).default(0),
    }).optional())
    .query(async ({ input }) => readCurrentDiscoveryFacts(input ?? {})),

  legalAuthorities: publicProcedure
    .input(z.object({
      query: z.string().trim().max(240).optional(),
      jurisdiction: z.string().trim().max(80).optional(),
      limit: z.number().int().min(1).max(250).default(100),
      offset: z.number().int().min(0).default(0),
    }).optional())
    // Counts describe the complete filtered universe, even beyond the final page.
    .query(async ({ input }) => read_current_legal_authorities(input)),

  legal_authority: publicProcedure
    .input(z.object({ object_ref: z.string().trim().min(1).max(256) }))
    .query(async ({ input }) => read_current_legal_authority(input.object_ref)),

  currentObjectCounts: publicProcedure.query(async () => {
    const result = await getPool().query(`
      select object_class,count(*)::int as count
        from public.v_lighthouse_civic_object_current_v1
       group by object_class
       order by count desc,object_class
    `);
    return {
      total: result.rows.reduce((sum, row) => sum + Number(row.count ?? 0), 0),
      by_object_class: Object.fromEntries(
        result.rows.map((row) => [String(row.object_class), Number(row.count ?? 0)]),
      ),
      rows: result.rows.map((row) => ({ object_class: String(row.object_class), count: Number(row.count ?? 0) })),
      source: "v_lighthouse_civic_object_current_v1",
    };
  }),

  pipelineState: publicProcedure.query(async () => {
    return getPipelineCompletionState();
  }),

  finalize: protectedProcedure
    .input(
      z.object({
        pipelineSource: z.string(),
        description: z.string(),
        canonicalTables: z.array(z.string()),
        recordsWritten: z.number(),
        errors: z.array(z.string()).optional(),
      })
    )
    .mutation(async ({ input }) => {
      return finalizePipelineRun({
        pipelineSource: input.pipelineSource as any,
        description: input.description,
        canonicalTables: input.canonicalTables,
        recordsWritten: input.recordsWritten,
        errors: input.errors,
      });
    }),

  reconnect: protectedProcedure.mutation(async () => {
    return reconnectAllSectors();
  }),
});
