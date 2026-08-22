/**
 * Registry Router — tRPC endpoints for canonical registry data
 * 
 * Endpoints:
 *   registry.listJurisdictions
 *   registry.getJurisdiction
 *   registry.listPrograms
 *   registry.searchPrograms         ← NEW: full-text search across all 3,395 programs
 *   registry.getProgramChain        ← NEW: program → agency → enforcement chain
 *   registry.getCrossAvenuePrograms ← NEW: related programs by category + jurisdiction
 *   registry.listPolicyAlerts
 *   registry.listWorkflows
 *   registry.listOversightBodies
 *   registry.searchOversightBodies  ← NEW: full-text search across all 1,362 oversight bodies
 *   registry.getSignals
 *   registry.getCounts
 */
import { router, publicProcedure, protectedProcedure } from "../_core/trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import * as registry_db from "../registry-db";
import { pool } from "../db";

export const registryRouter = router({
  listJurisdictions: publicProcedure.query(async () => {
    return registry_db.listJurisdictions();
  }),

  getJurisdiction: publicProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input }) => {
      const jurisdiction = await registry_db.getJurisdiction(input.id);
      if (!jurisdiction) return null;
      // Enrich with related data
      const programs = await registry_db.listPrograms(input.id);
      const alerts = await registry_db.listPolicyAlerts(input.id);
      const workflows = await registry_db.listWorkflows(input.id);
      const oversight = await registry_db.listOversightBodies(input.id);
      const signals = await registry_db.getSignals(input.id);
      const traceability = await registry_db.getSourceTraceability(input.id);
      const categories = await registry_db.getProgramCategories(input.id);
      return {
        ...jurisdiction,
        programs,
        policy_alerts: alerts,
        workflows,
        oversight_bodies: oversight,
        signals,
        source_traceability: traceability,
        program_categories: categories,
      };
    }),

  listPrograms: publicProcedure
    .input(z.object({
      jurisdictionId: z.string().optional(),
      category: z.string().optional(),
    }).optional())
    .query(async ({ input }) => {
      return registry_db.listPrograms(input?.jurisdictionId, input?.category);
    }),

  /**
   * Full-text search across all registry_programs (3,395 rows).
   * Supports filtering by jurisdiction abbreviation (e.g., "WA") or jurisdiction_id.
   */
  searchPrograms: publicProcedure
    .input(z.object({
      query: z.string().min(1),
      stateCode: z.string().optional(),  // e.g. "WA"
      category: z.string().optional(),
      limit: z.number().min(1).max(100).default(20),
      offset: z.number().min(0).default(0),
    }))
    .query(async ({ input }) => {
      const conditions: string[] = [];
      const params: any[] = [];
      const bind = (value: unknown) => {
        params.push(value);
        return `$${params.length}`;
      };

      const q = `%${input.query}%`;
      conditions.push(
        `(p.name ILIKE ${bind(q)} OR p.agency ILIKE ${bind(q)} OR p.eligibility ILIKE ${bind(q)} OR p.category ILIKE ${bind(q)})`,
      );

      if (input.stateCode) {
        conditions.push(`j.abbreviation = ${bind(input.stateCode.toUpperCase())}`);
      }
      if (input.category) {
        conditions.push(`p.category ILIKE ${bind(`%${input.category}%`)}`);
      }

      const where = `WHERE ${conditions.join(" AND ")}`;
      const limitPlaceholder = `$${params.length + 1}`;
      const offsetPlaceholder = `$${params.length + 2}`;
      const rowsResult = await pool.query(
        `SELECT p.id, p.name AS name, p.agency AS agency, p.category AS category,
                p.eligibility AS eligibility, p.contact AS contact, COALESCE(NULLIF(p.contact_website_norm, ''), NULLIF(p.website, '')) AS website,
                p.apply_notes AS apply_notes, COALESCE(NULLIF(p.jurisdiction_id, ''), p.jurisdiction_id_rp) AS jurisdiction_id,
                j.abbreviation AS state_code, j.name AS jurisdiction_name
         FROM registry_programs p
         LEFT JOIN registry_jurisdictions j ON
           COALESCE(NULLIF(p.jurisdiction_id, ''), p.jurisdiction_id_rp) = j.id
           OR UPPER(COALESCE(NULLIF(p.jurisdiction_id, ''), p.jurisdiction_id_rp)) = UPPER(j.abbreviation)
           OR LOWER(COALESCE(NULLIF(p.jurisdiction_id, ''), p.jurisdiction_id_rp)) = LOWER('us-' || j.abbreviation)
           OR LOWER(COALESCE(NULLIF(p.jurisdiction_id, ''), p.jurisdiction_id_rp)) = LOWER('j_' || j.abbreviation)
           OR LOWER(COALESCE(NULLIF(p.jurisdiction_id, ''), p.jurisdiction_id_rp)) =
              LOWER('j_' || REPLACE(REGEXP_REPLACE(j.name, '\\s+\\([^)]+\\)$', ''), ' ', '_'))
         ${where}
         ORDER BY p.name
         LIMIT ${limitPlaceholder} OFFSET ${offsetPlaceholder}`,
        [...params, input.limit, input.offset],
      );
      const countResult = await pool.query(
        `SELECT COUNT(*) as total FROM registry_programs p
         LEFT JOIN registry_jurisdictions j ON
           COALESCE(NULLIF(p.jurisdiction_id, ''), p.jurisdiction_id_rp) = j.id
           OR UPPER(COALESCE(NULLIF(p.jurisdiction_id, ''), p.jurisdiction_id_rp)) = UPPER(j.abbreviation)
           OR LOWER(COALESCE(NULLIF(p.jurisdiction_id, ''), p.jurisdiction_id_rp)) = LOWER('us-' || j.abbreviation)
           OR LOWER(COALESCE(NULLIF(p.jurisdiction_id, ''), p.jurisdiction_id_rp)) = LOWER('j_' || j.abbreviation)
           OR LOWER(COALESCE(NULLIF(p.jurisdiction_id, ''), p.jurisdiction_id_rp)) =
              LOWER('j_' || REPLACE(REGEXP_REPLACE(j.name, '\\s+\\([^)]+\\)$', ''), ' ', '_'))
         ${where}`,
        params,
      );
      return {
        programs: rowsResult.rows as any[],
        total: Number(countResult.rows[0]?.total ?? 0),
      };
    }),


  /**
   * Program → Agency → Enforcement Chain
   * 
   * Given a program ID, returns:
   * - The program details
   * - All oversight bodies in the same jurisdiction
   * - Enforcement pathways from those oversight bodies
   * - Related workflows for the jurisdiction
   */
  getProgramChain: publicProcedure
    .input(z.object({ programId: z.string() }))
    .query(async ({ input }) => {
      const programResult = await pool.query(
        `SELECT p.id, p.name AS name, p.agency AS agency, p.category AS category,
                p.eligibility AS eligibility, p.contact AS contact, COALESCE(NULLIF(p.contact_website_norm, ''), NULLIF(p.website, '')) AS website,
                p.apply_notes AS apply_notes, COALESCE(NULLIF(p.jurisdiction_id, ''), p.jurisdiction_id_rp) AS jurisdiction_id,
                j.abbreviation AS state_code, j.name AS jurisdiction_name
         FROM registry_programs p
         LEFT JOIN registry_jurisdictions j ON
           COALESCE(NULLIF(p.jurisdiction_id, ''), p.jurisdiction_id_rp) = j.id
           OR UPPER(COALESCE(NULLIF(p.jurisdiction_id, ''), p.jurisdiction_id_rp)) = UPPER(j.abbreviation)
           OR LOWER(COALESCE(NULLIF(p.jurisdiction_id, ''), p.jurisdiction_id_rp)) = LOWER('us-' || j.abbreviation)
           OR LOWER(COALESCE(NULLIF(p.jurisdiction_id, ''), p.jurisdiction_id_rp)) = LOWER('j_' || j.abbreviation)
           OR LOWER(COALESCE(NULLIF(p.jurisdiction_id, ''), p.jurisdiction_id_rp)) =
              LOWER('j_' || REPLACE(REGEXP_REPLACE(j.name, '\\s+\\([^)]+\\)$', ''), ' ', '_'))
         WHERE p.id = $1`,
        [input.programId],
      );
      const program = programResult.rows[0];
      if (!program) throw new TRPCError({ code: "NOT_FOUND", message: "Program not found" });

      const oversightResult = await pool.query(
        `SELECT ob.id, ob.agency_name_rob AS agency_name, ob.function_rob AS function,
                ob.statute_of_limitations_rob AS statute_of_limitations,
                ob.contact_rob AS contact, ob.pathway_rob AS pathway, ob.escalation_rob AS escalation,
                ob.jurisdiction_id_rob AS jurisdiction_id
         FROM registry_oversight_bodies ob
         LEFT JOIN registry_jurisdictions oj ON
           ob.jurisdiction_id_rob = oj.id
           OR UPPER(ob.jurisdiction_id_rob) = UPPER(oj.abbreviation)
           OR LOWER(ob.jurisdiction_id_rob) = LOWER('us-' || oj.abbreviation)
           OR LOWER(ob.jurisdiction_id_rob) = LOWER('j_' || oj.abbreviation)
           OR LOWER(ob.jurisdiction_id_rob) =
              LOWER('j_' || REPLACE(REGEXP_REPLACE(oj.name, '\\s+\\([^)]+\\)$', ''), ' ', '_'))
         WHERE ob.jurisdiction_id_rob = $1 OR oj.abbreviation = $2
         ORDER BY ob.agency_name_rob`,
        [program.jurisdiction_id, program.state_code],
      );

      const workflowResult = await pool.query(
        `SELECT id, workflow_type_rw AS workflow_type, primary_statutes_rw AS primary_statutes,
                steps_rw AS steps, deadlines_rw AS deadlines, escalation_paths_rw AS escalation_paths
         FROM registry_workflows w
         LEFT JOIN registry_jurisdictions wj ON
           w.jurisdiction_id_rw = wj.id
           OR UPPER(w.jurisdiction_id_rw) = UPPER(wj.abbreviation)
           OR LOWER(w.jurisdiction_id_rw) = LOWER('us-' || wj.abbreviation)
           OR LOWER(w.jurisdiction_id_rw) = LOWER('j_' || wj.abbreviation)
           OR LOWER(w.jurisdiction_id_rw) =
              LOWER('j_' || REPLACE(REGEXP_REPLACE(wj.name, '\\s+\\([^)]+\\)$', ''), ' ', '_'))
         WHERE w.jurisdiction_id_rw = $1 OR wj.abbreviation = $2
         ORDER BY w.workflow_type_rw`,
        [program.jurisdiction_id, program.state_code],
      );

      const relatedResult = await pool.query(
        `SELECT p2.id, p2.name AS name, p2.agency AS agency, p2.category AS category,
                p2.contact AS contact, p2.website AS website
         FROM registry_programs p2
         LEFT JOIN registry_jurisdictions p2j ON
           COALESCE(NULLIF(p2.jurisdiction_id, ''), p2.jurisdiction_id_rp) = p2j.id
           OR UPPER(COALESCE(NULLIF(p2.jurisdiction_id, ''), p2.jurisdiction_id_rp)) = UPPER(p2j.abbreviation)
           OR LOWER(COALESCE(NULLIF(p2.jurisdiction_id, ''), p2.jurisdiction_id_rp)) = LOWER('us-' || p2j.abbreviation)
           OR LOWER(COALESCE(NULLIF(p2.jurisdiction_id, ''), p2.jurisdiction_id_rp)) = LOWER('j_' || p2j.abbreviation)
           OR LOWER(COALESCE(NULLIF(p2.jurisdiction_id, ''), p2.jurisdiction_id_rp)) =
              LOWER('j_' || REPLACE(REGEXP_REPLACE(p2j.name, '\\s+\\([^)]+\\)$', ''), ' ', '_'))
         WHERE (COALESCE(NULLIF(p2.jurisdiction_id, ''), p2.jurisdiction_id_rp) = $1 OR p2j.abbreviation = $2)
           AND p2.category = $3
           AND p2.id != $4
         ORDER BY p2.name
         LIMIT 10`,
        [program.jurisdiction_id, program.state_code, program.category, input.programId],
      );

      return {
        program,
        oversight_bodies: oversightResult.rows as any[],
        workflows: workflowResult.rows as any[],
        related_programs: relatedResult.rows as any[],
        chain: {
          program: program.name,
          jurisdiction: program.jurisdiction_name || program.jurisdiction_id,
          state_code: program.state_code,
          oversight_count: oversightResult.rows.length,
          workflow_count: workflowResult.rows.length,
          related_program_count: relatedResult.rows.length,
        },
      };
    }),


  /**
   * Cross-Avenue Discovery
   * 
   * Given a category and optional state, returns programs from adjacent/related categories
   * that the user might not have considered. This powers the "You might also qualify for..." 
   * section in the Benefits Navigator.
   */
  getCrossAvenuePrograms: publicProcedure
    .input(z.object({
      category: z.string(),
      stateCode: z.string().optional(),
      limit: z.number().min(1).max(50).default(10),
    }))
    .query(async ({ input }) => {
      // Category adjacency map — related categories for cross-avenue discovery
      const ADJACENT_CATEGORIES: Record<string, string[]> = {
        food: ['cash_assistance', 'housing', 'healthcare', 'children_families'],
        housing: ['food', 'utilities', 'cash_assistance', 'domestic_violence', 'elder_care'],
        healthcare: ['disability', 'elder_care', 'children_families', 'cash_assistance'],
        cash_assistance: ['food', 'housing', 'utilities', 'employment'],
        domestic_violence: ['housing', 'legal_aid', 'healthcare', 'crisis'],
        disability: ['healthcare', 'cash_assistance', 'employment', 'elder_care'],
        elder_care: ['healthcare', 'housing', 'disability', 'food'],
        legal_aid: ['housing', 'employment', 'domestic_violence', 'immigration'],
        employment: ['cash_assistance', 'disability', 'legal_aid', 'food'],
        immigration: ['legal_aid', 'healthcare', 'food', 'housing'],
        children_families: ['food', 'healthcare', 'housing', 'cash_assistance'],
        veterans: ['healthcare', 'housing', 'disability', 'employment'],
        tribal_indigenous: ['food', 'housing', 'healthcare', 'legal_aid'],
        utilities: ['housing', 'food', 'cash_assistance'],
        crisis: ['domestic_violence', 'healthcare', 'housing'],
      };

      const adjacent = ADJACENT_CATEGORIES[input.category] || [];
      if (adjacent.length === 0) return { programs: [], adjacent_categories: [] };

      const placeholders = adjacent.map((_, index) => `$${index + 1}`).join(', ');
      const params: any[] = [...adjacent];

      let stateFilter = '';
      if (input.stateCode) {
        params.push(input.stateCode.toUpperCase());
        stateFilter = `AND j.abbreviation = $${params.length}`;
      }

      const limitPlaceholder = `$${params.length + 1}`;
      const rowsResult = await pool.query(
        `SELECT p.id, p.name AS name, p.agency AS agency, p.category AS category,
                p.eligibility AS eligibility, p.contact AS contact, COALESCE(NULLIF(p.contact_website_norm, ''), NULLIF(p.website, '')) AS website,
                p.apply_notes AS apply_notes, j.abbreviation AS state_code, j.name AS jurisdiction_name
         FROM registry_programs p
         LEFT JOIN registry_jurisdictions j ON
           COALESCE(NULLIF(p.jurisdiction_id, ''), p.jurisdiction_id_rp) = j.id
           OR UPPER(COALESCE(NULLIF(p.jurisdiction_id, ''), p.jurisdiction_id_rp)) = UPPER(j.abbreviation)
           OR LOWER(COALESCE(NULLIF(p.jurisdiction_id, ''), p.jurisdiction_id_rp)) = LOWER('us-' || j.abbreviation)
           OR LOWER(COALESCE(NULLIF(p.jurisdiction_id, ''), p.jurisdiction_id_rp)) = LOWER('j_' || j.abbreviation)
           OR LOWER(COALESCE(NULLIF(p.jurisdiction_id, ''), p.jurisdiction_id_rp)) =
              LOWER('j_' || REPLACE(REGEXP_REPLACE(j.name, '\\s+\\([^)]+\\)$', ''), ' ', '_'))
         WHERE p.category IN (${placeholders})
         ${stateFilter}
         ORDER BY p.category, p.name
         LIMIT ${limitPlaceholder}`,
        [...params, input.limit],
      );

      return {
        programs: rowsResult.rows as any[],
        adjacent_categories: adjacent,
      };
    }),

  listPolicyAlerts: publicProcedure
    .input(z.object({
      jurisdictionId: z.string().optional(),
    }).optional())
    .query(async ({ input }) => {
      return registry_db.listPolicyAlerts(input?.jurisdictionId);
    }),

  listWorkflows: publicProcedure
    .input(z.object({
      jurisdictionId: z.string().optional(),
    }).optional())
    .query(async ({ input }) => {
      return registry_db.listWorkflows(input?.jurisdictionId);
    }),

  listOversightBodies: publicProcedure
    .input(z.object({
      jurisdictionId: z.string().optional(),
    }).optional())
    .query(async ({ input }) => {
      return registry_db.listOversightBodies(input?.jurisdictionId);
    }),

  /**
   * Full-text search across all registry_oversight_bodies (1,362 rows).
   */
  searchOversightBodies: publicProcedure
    .input(z.object({
      query: z.string().min(1),
      stateCode: z.string().optional(),
      limit: z.number().min(1).max(100).default(20),
      offset: z.number().min(0).default(0),
    }))
    .query(async ({ input }) => {
      const conditions: string[] = [];
      const params: any[] = [];
      const bind = (value: unknown) => {
        params.push(value);
        return `$${params.length}`;
      };

      const q = `%${input.query}%`;
      conditions.push(
        `(ob.agency_name_rob ILIKE ${bind(q)} OR ob.function_rob ILIKE ${bind(q)} OR ob.pathway_rob ILIKE ${bind(q)})`,
      );

      if (input.stateCode) {
        conditions.push(`j.abbreviation = ${bind(input.stateCode.toUpperCase())}`);
      }

      const where = `WHERE ${conditions.join(" AND ")}`;
      const limitPlaceholder = `$${params.length + 1}`;
      const offsetPlaceholder = `$${params.length + 2}`;
      const rowsResult = await pool.query(
        `SELECT ob.id, ob.agency_name_rob AS agency_name, ob.function_rob AS function,
                ob.statute_of_limitations_rob AS statute_of_limitations,
                ob.contact_rob AS contact, ob.pathway_rob AS pathway, ob.escalation_rob AS escalation,
                j.abbreviation AS state_code, j.name AS jurisdiction_name
         FROM registry_oversight_bodies ob
         LEFT JOIN registry_jurisdictions j ON
           ob.jurisdiction_id_rob = j.id
           OR UPPER(ob.jurisdiction_id_rob) = UPPER(j.abbreviation)
           OR LOWER(ob.jurisdiction_id_rob) = LOWER('us-' || j.abbreviation)
           OR LOWER(ob.jurisdiction_id_rob) = LOWER('j_' || j.abbreviation)
           OR LOWER(ob.jurisdiction_id_rob) =
              LOWER('j_' || REPLACE(REGEXP_REPLACE(j.name, '\\s+\\([^)]+\\)$', ''), ' ', '_'))
         ${where}
         ORDER BY ob.agency_name_rob
         LIMIT ${limitPlaceholder} OFFSET ${offsetPlaceholder}`,
        [...params, input.limit, input.offset],
      );
      const countResult = await pool.query(
        `SELECT COUNT(*) as total FROM registry_oversight_bodies ob
         LEFT JOIN registry_jurisdictions j ON
           ob.jurisdiction_id_rob = j.id
           OR UPPER(ob.jurisdiction_id_rob) = UPPER(j.abbreviation)
           OR LOWER(ob.jurisdiction_id_rob) = LOWER('us-' || j.abbreviation)
           OR LOWER(ob.jurisdiction_id_rob) = LOWER('j_' || j.abbreviation)
           OR LOWER(ob.jurisdiction_id_rob) =
              LOWER('j_' || REPLACE(REGEXP_REPLACE(j.name, '\\s+\\([^)]+\\)$', ''), ' ', '_'))
         ${where}`,
        params,
      );
      return {
        bodies: rowsResult.rows as any[],
        total: Number(countResult.rows[0]?.total ?? 0),
      };
    }),


  getSignals: publicProcedure
    .input(z.object({
      jurisdictionId: z.string().optional(),
      signalType: z.string().optional(),
    }).optional())
    .query(async ({ input }) => {
      return registry_db.getSignals(input?.jurisdictionId, input?.signalType);
    }),

  getCounts: publicProcedure.query(async () => {
    return registry_db.getCounts();
  }),
});

/**
 * Issue Reports Router — universal flag/report system
 * Any user can flag a program, signal, finding, KB table entry, or oversight body.
 * Admins can view and resolve flags in Mission Control.
 */
export const issueReportsRouter = router({
  report: publicProcedure
    .input(z.object({
      targetType: z.enum(["program", "signal", "finding", "kb_table", "oversight_body", "workflow", "area", "other"]),
      targetId: z.string(),
      targetLabel: z.string().optional(),
      issueType: z.enum(["incorrect_data", "broken_link", "missing_info", "duplicate", "other"]).default("incorrect_data"),
      description: z.string().max(2000).optional(),
      areaName: z.string().max(255).optional(),
      stateCode: z.string().max(10).optional(),
      lat: z.number().optional(),
      lng: z.number().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const now = Date.now();
      const user = (ctx as any).user;
      await pool.query(
        `INSERT INTO issue_reports (target_type, target_id, target_label, issue_type, description, reporter_id, reporter_name, status, area_name, state_code, lat, lng, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'open', $8, $9, $10, $11, $12, $13)`,
        [
          input.targetType,
          input.targetId,
          input.targetLabel ?? null,
          input.issueType,
          input.description ?? null,
          user?.id ?? null,
          user?.name ?? null,
          input.areaName ?? null,
          input.stateCode ?? null,
          input.lat ?? null,
          input.lng ?? null,
          now,
          now,
        ],
      );
      return { success: true };
    }),

  listOpen: publicProcedure
    .input(z.object({
      status: z.enum(["open", "reviewed", "resolved", "dismissed", "all"]).default("open"),
      targetType: z.string().optional(),
      limit: z.number().min(1).max(100).default(50),
      offset: z.number().min(0).default(0),
    }))
    .query(async ({ input }) => {
      const conditions: string[] = [];
      const params: any[] = [];
      const bind = (value: unknown) => {
        params.push(value);
        return `$${params.length}`;
      };
      if (input.status !== "all") {
        conditions.push(`status = ${bind(input.status)}`);
      }
      if (input.targetType) {
        conditions.push(`target_type = ${bind(input.targetType)}`);
      }
      const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
      const limitPlaceholder = `$${params.length + 1}`;
      const offsetPlaceholder = `$${params.length + 2}`;
      const rowsResult = await pool.query(
        `SELECT * FROM issue_reports ${where} ORDER BY created_at DESC LIMIT ${limitPlaceholder} OFFSET ${offsetPlaceholder}`,
        [...params, input.limit, input.offset],
      );
      const countResult = await pool.query(
        `SELECT COUNT(*) as total FROM issue_reports ${where}`,
        params,
      );
      return {
        reports: rowsResult.rows as any[],
        total: Number(countResult.rows[0]?.total ?? 0),
      };
    }),

  summary: publicProcedure.query(async () => {
    const result = await pool.query(
      `SELECT status, COUNT(*) as cnt FROM issue_reports GROUP BY status`,
    );
    const counts: Record<string, number> = {};
    for (const row of result.rows as any[]) {
      counts[row.status] = Number(row.cnt);
    }
    return {
      open: counts.open ?? 0,
      reviewed: counts.reviewed ?? 0,
      resolved: counts.resolved ?? 0,
      dismissed: counts.dismissed ?? 0,
      total: Object.values(counts).reduce((a, b) => a + b, 0),
    };
  }),

  resolve: publicProcedure
    .input(z.object({
      id: z.number(),
      status: z.enum(["reviewed", "resolved", "dismissed"]),
      note: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      await pool.query(
        `UPDATE issue_reports SET status = $1, resolution_note = $2, updated_at = $3 WHERE id = $4`,
        [input.status, input.note ?? null, Date.now(), input.id],
      );
      return { success: true };
    }),
});
