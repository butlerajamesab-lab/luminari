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
    .query(async ({ input }) => {
      // Paged reader: total reports the complete filtered universe; items are one response window.
      const value = input ?? { limit: 100, offset: 0 };
      const params: unknown[] = [];
      const where: string[] = ["legal_catalog_ready is true"];
      if (value.query) {
        params.push(`%${value.query}%`);
        const p = `$${params.length}`;
        where.push(`(
          coalesce(name,'') ilike ${p}
          or coalesce(description,'') ilike ${p}
          or coalesce(statutory_authority,'') ilike ${p}
          or coalesce(category,'') ilike ${p}
          or coalesce(layer,'') ilike ${p}
          or coalesce(jurisdiction,'') ilike ${p}
        )`);
      }
      if (value.jurisdiction) {
        params.push(value.jurisdiction.toUpperCase());
        where.push(`upper(coalesce(state_code,jurisdiction))=$${params.length}`);
      }
      params.push(value.limit ?? 100, value.offset ?? 0);
      const limitParam = `$${params.length - 1}`;
      const offsetParam = `$${params.length}`;
      const result = await getPool().query(
        `select civic_object_uid,object_ref,source_object_type,object_class,target_surface,
                run_id::text,current_run_role,current_run_engine_version,current_run_completed_at,
                artifact_key,artifact_role,source_locator,source_content_sha256,source_candidate_hash,
                parser_version,jurisdiction,state_code,section_name,name,organization_name,category,layer,
                description,statutory_authority,deadline,candidate_state,source_created_at,field_provenance,
                projection_state,projection_version,reconciled_at,data_state,legal_catalog_ready,
                count(*) over()::int as filtered_total
           from public.v_lighthouse_legal_authority_catalog_v2
          where ${where.join(" and ")}
          order by name asc nulls last,object_ref asc
          limit ${limitParam} offset ${offsetParam}`,
        params,
      );
      return {
        total: Number(result.rows[0]?.filtered_total ?? 0),
        limit: value.limit ?? 100,
        offset: value.offset ?? 0,
        items: result.rows.map(({ filtered_total: _filteredTotal, ...row }) => row),
        catalog: "current_legal_authority_catalog_v2",
        window_only: true,
      };
    }),

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
