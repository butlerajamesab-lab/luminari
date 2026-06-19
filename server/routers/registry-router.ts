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
import * as registryDb from "../registry-db";
import { pool } from "../db";

export const registryRouter = router({
  listJurisdictions: publicProcedure.query(async () => {
    return registryDb.listJurisdictions();
  }),

  getJurisdiction: publicProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input }) => {
      const jurisdiction = await registryDb.getJurisdiction(input.id);
      if (!jurisdiction) return null;
      // Enrich with related data
      const programs = await registryDb.listPrograms(input.id);
      const alerts = await registryDb.listPolicyAlerts(input.id);
      const workflows = await registryDb.listWorkflows(input.id);
      const oversight = await registryDb.listOversightBodies(input.id);
      const signals = await registryDb.getSignals(input.id);
      const traceability = await registryDb.getSourceTraceability(input.id);
      const categories = await registryDb.getProgramCategories(input.id);
      return {
        ...jurisdiction,
        programs,
        policyAlerts: alerts,
        workflows,
        oversightBodies: oversight,
        signals,
        sourceTraceability: traceability,
        programCategories: categories,
      };
    }),

  listPrograms: publicProcedure
    .input(z.object({
      jurisdictionId: z.string().optional(),
      category: z.string().optional(),
    }).optional())
    .query(async ({ input }) => {
      return registryDb.listPrograms(input?.jurisdictionId, input?.category);
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

      const q = `%${input.query}%`;
      conditions.push(`(p.name_rp LIKE ? OR p.agency_rp LIKE ? OR p.eligibility_rp LIKE ? OR p.category_rp LIKE ?)`);
      params.push(q, q, q, q);

      if (input.stateCode) {
        // Match by jurisdiction abbreviation
        conditions.push(`j.abbreviation = ?`);
        params.push(input.stateCode.toUpperCase());
      }
      if (input.category) {
        conditions.push(`p.category_rp LIKE ?`);
        params.push(`%${input.category}%`);
      }

      const where = `WHERE ${conditions.join(' AND ')}`;
      const [rows] = await pool.query(
        `SELECT p.id, p.name_rp AS name, p.agency_rp AS agency, p.category_rp AS category,
                p.eligibility_rp AS eligibility, p.contact_rp AS contact, p.website_rp AS website,
                p.apply_notes_rp AS apply_notes, p.jurisdiction_id_rp AS jurisdiction_id,
                j.abbreviation AS state_code, j.name AS jurisdiction_name
         FROM registry_programs p
         LEFT JOIN registry_jurisdictions j ON p.jurisdiction_id_rp = j.id
         ${where}
         ORDER BY p.name_rp
         LIMIT ? OFFSET ?`,
        [...params, input.limit, input.offset]
      );
      const [countRows] = await pool.query(
        `SELECT COUNT(*) as total FROM registry_programs p
         LEFT JOIN registry_jurisdictions j ON p.jurisdiction_id_rp = j.id
         ${where}`,
        params
      );
      return {
        programs: rows as any[],
        total: Number((countRows as any[])[0]?.total ?? 0),
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
      // 1. Get the program
      const [progRows] = await pool.query(
        `SELECT p.id, p.name_rp AS name, p.agency_rp AS agency, p.category_rp AS category,
                p.eligibility_rp AS eligibility, p.contact_rp AS contact, p.website_rp AS website,
                p.apply_notes_rp AS apply_notes, p.jurisdiction_id_rp AS jurisdiction_id,
                j.abbreviation AS state_code, j.name AS jurisdiction_name
         FROM registry_programs p
         LEFT JOIN registry_jurisdictions j ON p.jurisdiction_id_rp = j.id
         WHERE p.id = ?`,
        [input.programId]
      );
      const program = (progRows as any[])[0];
      if (!program) throw new TRPCError({ code: "NOT_FOUND", message: "Program not found" });

      // 2. Get oversight bodies in the same jurisdiction
      const [oversightRows] = await pool.query(
        `SELECT ob.id, ob.agency_name_rob AS agency_name, ob.function_rob AS function,
                ob.statute_of_limitations_rob AS statute_of_limitations,
                ob.contact_rob AS contact, ob.pathway_rob AS pathway, ob.escalation_rob AS escalation,
                ob.jurisdiction_id_rob AS jurisdiction_id
         FROM registry_oversight_bodies ob
         WHERE ob.jurisdiction_id_rob = ?
         ORDER BY ob.agency_name_rob`,
        [program.jurisdiction_id]
      );

      // 3. Get related workflows for the jurisdiction
      const [workflowRows] = await pool.query(
        `SELECT id, workflow_type_rw AS workflow_type, primary_statutes_rw AS primary_statutes,
                steps_rw AS steps, deadlines_rw AS deadlines, escalation_paths_rw AS escalation_paths
         FROM registry_workflows
         WHERE jurisdiction_id_rw = ?
         ORDER BY workflow_type_rw`,
        [program.jurisdiction_id]
      );

      // 4. Get cross-avenue programs (same category, same jurisdiction)
      const [crossRows] = await pool.query(
        `SELECT p2.id, p2.name_rp AS name, p2.agency_rp AS agency, p2.category_rp AS category,
                p2.contact_rp AS contact, p2.website_rp AS website
         FROM registry_programs p2
         WHERE p2.jurisdiction_id_rp = ?
           AND p2.category_rp = ?
           AND p2.id != ?
         ORDER BY p2.name_rp
         LIMIT 10`,
        [program.jurisdiction_id, program.category, input.programId]
      );

      return {
        program,
        oversightBodies: oversightRows as any[],
        workflows: workflowRows as any[],
        relatedPrograms: crossRows as any[],
        chain: {
          program: program.name,
          jurisdiction: program.jurisdiction_name || program.jurisdiction_id,
          state_code: program.state_code,
          oversightCount: (oversightRows as any[]).length,
          workflowCount: (workflowRows as any[]).length,
          relatedProgramCount: (crossRows as any[]).length,
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
      if (adjacent.length === 0) return { programs: [], adjacentCategories: [] };

      const placeholders = adjacent.map(() => '?').join(', ');
      const params: any[] = [...adjacent];

      let stateFilter = '';
      if (input.stateCode) {
        stateFilter = `AND j.abbreviation = ?`;
        params.push(input.stateCode.toUpperCase());
      }

      const [rows] = await pool.query(
        `SELECT p.id, p.name_rp AS name, p.agency_rp AS agency, p.category_rp AS category,
                p.eligibility_rp AS eligibility, p.contact_rp AS contact, p.website_rp AS website,
                p.apply_notes_rp AS apply_notes, j.abbreviation AS state_code, j.name AS jurisdiction_name
         FROM registry_programs p
         LEFT JOIN registry_jurisdictions j ON p.jurisdiction_id_rp = j.id
         WHERE p.category_rp IN (${placeholders})
         ${stateFilter}
         ORDER BY p.category_rp, p.name_rp
         LIMIT ?`,
        [...params, input.limit]
      );

      return {
        programs: rows as any[],
        adjacentCategories: adjacent,
      };
    }),

  listPolicyAlerts: publicProcedure
    .input(z.object({
      jurisdictionId: z.string().optional(),
    }).optional())
    .query(async ({ input }) => {
      return registryDb.listPolicyAlerts(input?.jurisdictionId);
    }),

  listWorkflows: publicProcedure
    .input(z.object({
      jurisdictionId: z.string().optional(),
    }).optional())
    .query(async ({ input }) => {
      return registryDb.listWorkflows(input?.jurisdictionId);
    }),

  listOversightBodies: publicProcedure
    .input(z.object({
      jurisdictionId: z.string().optional(),
    }).optional())
    .query(async ({ input }) => {
      return registryDb.listOversightBodies(input?.jurisdictionId);
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

      const q = `%${input.query}%`;
      conditions.push(`(ob.agency_name_rob LIKE ? OR ob.function_rob LIKE ? OR ob.pathway_rob LIKE ?)`);
      params.push(q, q, q);

      if (input.stateCode) {
        conditions.push(`j.abbreviation = ?`);
        params.push(input.stateCode.toUpperCase());
      }

      const where = `WHERE ${conditions.join(' AND ')}`;
      const [rows] = await pool.query(
        `SELECT ob.id, ob.agency_name_rob AS agency_name, ob.function_rob AS function,
                ob.statute_of_limitations_rob AS statute_of_limitations,
                ob.contact_rob AS contact, ob.pathway_rob AS pathway, ob.escalation_rob AS escalation,
                j.abbreviation AS state_code, j.name AS jurisdiction_name
         FROM registry_oversight_bodies ob
         LEFT JOIN registry_jurisdictions j ON ob.jurisdiction_id_rob = j.id
         ${where}
         ORDER BY ob.agency_name_rob
         LIMIT ? OFFSET ?`,
        [...params, input.limit, input.offset]
      );
      const [countRows] = await pool.query(
        `SELECT COUNT(*) as total FROM registry_oversight_bodies ob
         LEFT JOIN registry_jurisdictions j ON ob.jurisdiction_id_rob = j.id
         ${where}`,
        params
      );
      return {
        bodies: rows as any[],
        total: Number((countRows as any[])[0]?.total ?? 0),
      };
    }),

  getSignals: publicProcedure
    .input(z.object({
      jurisdictionId: z.string().optional(),
      signalType: z.string().optional(),
    }).optional())
    .query(async ({ input }) => {
      return registryDb.getSignals(input?.jurisdictionId, input?.signalType);
    }),

  getCounts: publicProcedure.query(async () => {
    return registryDb.getCounts();
  }),
});

/**
 * Issue Reports Router — universal flag/report system
 * Any user can flag a program, signal, finding, KB table entry, or oversight body.
 * Admins can view and resolve flags in Mission Control.
 */
export const issueReportsRouter = router({
  /** Submit a new flag/report */
  report: publicProcedure
    .input(z.object({
      targetType: z.enum(["program", "signal", "finding", "kb_table", "oversight_body", "workflow", "area", "other"]),
      targetId: z.string(),
      targetLabel: z.string().optional(),
      issueType: z.enum(["incorrect_data", "broken_link", "missing_info", "duplicate", "other"]).default("incorrect_data"),
      description: z.string().max(2000).optional(),
      // Geographic area flagging
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
         VALUES (?, ?, ?, ?, ?, ?, ?, 'open', ?, ?, ?, ?, ?, ?)`,
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
        ]
      );
      return { success: true };
    }),

  /** List all flags (admin use) */
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
      if (input.status !== "all") {
        conditions.push("status = ?");
        params.push(input.status);
      }
      if (input.targetType) {
        conditions.push("target_type = ?");
        params.push(input.targetType);
      }
      const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
      const [rows] = await pool.query(
        `SELECT * FROM issue_reports ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
        [...params, input.limit, input.offset]
      );
      const [countRows] = await pool.query(
        `SELECT COUNT(*) as total FROM issue_reports ${where}`,
        params
      );
      return {
        reports: rows as any[],
        total: Number((countRows as any[])[0]?.total ?? 0),
      };
    }),

  /** Get summary counts for the Mission Control flag queue */
  summary: publicProcedure.query(async () => {
    const [rows] = await pool.query(
      `SELECT status, COUNT(*) as cnt FROM issue_reports GROUP BY status`
    );
    const counts: Record<string, number> = {};
    for (const row of rows as any[]) {
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

  /** Resolve or dismiss a flag */
  resolve: publicProcedure
    .input(z.object({
      id: z.number(),
      status: z.enum(["reviewed", "resolved", "dismissed"]),
      note: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      await pool.query(
        `UPDATE issue_reports SET status = ?, resolution_note = ?, updated_at = ? WHERE id = ?`,
        [input.status, input.note ?? null, Date.now(), input.id]
      );
      return { success: true };
    }),
});
