/**
 * Registry Router
 * tRPC procedures for querying forms, agencies, escalation paths, and mental health resources
 */
import { router, publicProcedure } from "../_core/trpc";
import { z } from "zod";
import mysql from "mysql2/promise";
import { db, pool } from "../db";
import {
  formsRegistry,
  agenciesRegistry,
  escalationRegistry,
  mentalHealthResources,
} from "../../drizzle/schema";
import { eq, and, like } from "drizzle-orm";

console.log("🔥 REGISTRY ROUTER LOADED");

export const registryRouter = router({
  // ─── Forms Queries ───

  /**
   * Get all forms for a specific domain and optional jurisdiction
   */
  getFormsByDomain: publicProcedure
    .input(z.object({
      domain: z.string(),
      jurisdiction: z.string().optional(),
    }))
    .query(async ({ input }) => {
      const conditions: ReturnType<typeof eq>[] = [
        eq(formsRegistry.isActive, true),
      ];
      if (input.domain) conditions.push(eq(formsRegistry.domain, input.domain as any));
      if (input.jurisdiction) conditions.push(eq(formsRegistry.jurisdiction, input.jurisdiction));

      return await db.select().from(formsRegistry).where(and(...conditions));
    }),

  /**
   * Search forms by name
   */
  searchForms: publicProcedure
    .input(z.object({
      query: z.string(),
      domain: z.string().optional(),
    }))
    .query(async ({ input }) => {
      const conditions: ReturnType<typeof eq>[] = [
        like(formsRegistry.formName, `%${input.query}%`) as any,
        eq(formsRegistry.isActive, true),
      ];
      if (input.domain) conditions.push(eq(formsRegistry.domain, input.domain as any));

      return await db.select().from(formsRegistry).where(and(...conditions));
    }),

  /**
   * Get a specific form by ID
   */
  getFormById: publicProcedure
    .input(z.object({ formId: z.string() }))
    .query(async ({ input }) => {
      const form = await db
        .select()
        .from(formsRegistry)
        .where(eq(formsRegistry.id, input.formId))
        .limit(1);

      return form[0] || null;
    }),

  // ─── Agencies Queries ───

  /**
   * Get all agencies for a specific domain and optional jurisdiction
   */
  getAgenciesByDomain: publicProcedure
    .input(z.object({
      domain: z.string(),
      jurisdiction: z.string().optional(),
    }))
    .query(async ({ input }) => {
      const conditions: ReturnType<typeof eq>[] = [
        eq(agenciesRegistry.officialStatus, "active"),
      ];
      if (input.domain) conditions.push(eq(agenciesRegistry.domain, input.domain as any));
      if (input.jurisdiction) conditions.push(eq(agenciesRegistry.jurisdiction, input.jurisdiction));

      return await db.select().from(agenciesRegistry).where(and(...conditions));
    }),

  /**
   * Get a specific agency by ID
   */
  getAgencyById: publicProcedure
    .input(z.object({ agencyId: z.string() }))
    .query(async ({ input }) => {
      const agency = await db
        .select()
        .from(agenciesRegistry)
        .where(eq(agenciesRegistry.id, input.agencyId))
        .limit(1);

      return agency[0] || null;
    }),

  /**
   * Get all forms for a specific agency
   */
  getFormsByAgency: publicProcedure
    .input(z.object({ agencyId: z.string() }))
    .query(async ({ input }) => {
      return await db
        .select()
        .from(formsRegistry)
        .where(
          and(
            eq(formsRegistry.agencyId, input.agencyId),
            eq(formsRegistry.isActive, true)
          )
        );
    }),

  // ─── Escalation Queries ───

  /**
   * Get escalation paths from a specific agency
   */
  getEscalationsFrom: publicProcedure
    .input(z.object({
      agencyId: z.string(),
      domain: z.string().optional(),
    }))
    .query(async ({ input }) => {
      const conditions: ReturnType<typeof eq>[] = [
        eq(escalationRegistry.fromAgencyId, input.agencyId),
      ];
      if (input.domain) conditions.push(eq(escalationRegistry.domain, input.domain as any));

      return await db.select().from(escalationRegistry).where(and(...conditions));
    }),

  /**
   * Get escalation paths to a specific agency
   */
  getEscalationsTo: publicProcedure
    .input(z.object({
      agencyId: z.string(),
      domain: z.string().optional(),
    }))
    .query(async ({ input }) => {
      const conditions: ReturnType<typeof eq>[] = [
        eq(escalationRegistry.toAgencyId, input.agencyId),
      ];
      if (input.domain) conditions.push(eq(escalationRegistry.domain, input.domain as any));

      return await db.select().from(escalationRegistry).where(and(...conditions));
    }),

  /**
   * Get full escalation path for a domain
   */
  getEscalationPath: publicProcedure
    .input(z.object({
      domain: z.string(),
      jurisdiction: z.string().optional(),
    }))
    .query(async ({ input }) => {
      const conditions: ReturnType<typeof eq>[] = [
        eq(escalationRegistry.domain, input.domain as any),
      ];
      if (input.jurisdiction) conditions.push(eq(escalationRegistry.jurisdiction, input.jurisdiction));

      return await db.select().from(escalationRegistry).where(and(...conditions));
    }),

  // ─── Mental Health Resources Queries ───

  /**
   * Get mental health resources by type and jurisdiction
   */
  getMentalHealthResources: publicProcedure
    .input(z.object({
      resourceType: z.string().optional(),
      jurisdiction: z.string().optional(),
    }))
    .query(async ({ input }) => {
      const conditions: ReturnType<typeof eq>[] = [];
      if (input.resourceType) conditions.push(eq(mentalHealthResources.resourceType, input.resourceType as any));
      if (input.jurisdiction) conditions.push(eq(mentalHealthResources.jurisdiction, input.jurisdiction));

      if (conditions.length === 0) {
        return await db.select().from(mentalHealthResources);
      }
      return await db.select().from(mentalHealthResources).where(and(...conditions));
    }),

  /**
   * Search mental health resources by name
   */
  searchMentalHealthResources: publicProcedure
    .input(z.object({
      query: z.string(),
      jurisdiction: z.string().optional(),
    }))
    .query(async ({ input }) => {
      const conditions: ReturnType<typeof eq>[] = [
        like(mentalHealthResources.resourceName, `%${input.query}%`) as any,
      ];
      if (input.jurisdiction) conditions.push(eq(mentalHealthResources.jurisdiction, input.jurisdiction));

      return await db.select().from(mentalHealthResources).where(and(...conditions));
    }),

  /**
   * Get a specific mental health resource by ID
   */
  getMentalHealthResourceById: publicProcedure
    .input(z.object({ resourceId: z.string() }))
    .query(async ({ input }) => {
      const resource = await db
        .select()
        .from(mentalHealthResources)
        .where(eq(mentalHealthResources.id, input.resourceId))
        .limit(1);

      return resource[0] || null;
    }),

  // ─── Composite Queries ───

  /**
   * Get complete domain profile: agencies, forms, escalation paths
   */
  getDomainProfile: publicProcedure
    .input(z.object({
      domain: z.string(),
      jurisdiction: z.string().optional(),
    }))
    .query(async ({ input }) => {
      const agencyConditions: ReturnType<typeof eq>[] = [
        eq(agenciesRegistry.officialStatus, "active"),
        eq(agenciesRegistry.domain, input.domain as any),
      ];
      if (input.jurisdiction) agencyConditions.push(eq(agenciesRegistry.jurisdiction, input.jurisdiction));

      const formConditions: ReturnType<typeof eq>[] = [
        eq(formsRegistry.isActive, true),
        eq(formsRegistry.domain, input.domain as any),
      ];
      if (input.jurisdiction) formConditions.push(eq(formsRegistry.jurisdiction, input.jurisdiction));

      const escalationConditions: ReturnType<typeof eq>[] = [
        eq(escalationRegistry.domain, input.domain as any),
      ];
      if (input.jurisdiction) escalationConditions.push(eq(escalationRegistry.jurisdiction, input.jurisdiction));

      const [agencies, forms, escalations] = await Promise.all([
        db.select().from(agenciesRegistry).where(and(...agencyConditions)),
        db.select().from(formsRegistry).where(and(...formConditions)),
        db.select().from(escalationRegistry).where(and(...escalationConditions)),
      ]);

      return {
        domain: input.domain,
        jurisdiction: input.jurisdiction || "NATIONAL",
        agencies,
        forms,
        escalations,
        summary: {
          agencyCount: agencies.length,
          formCount: forms.length,
          escalationCount: escalations.length,
        },
      };
    }),

  /**
   * Get all workflows (from workflow_pipeline table)
   * Raw data - no mapping
   */
  getWorkflows: publicProcedure
    .query(async () => {
      const connection = await mysql.createConnection({
        host: "gateway04.us-east-1.prod.aws.tidbcloud.com",
        port: 4000,
        user: "2jhK1AfHyk6mXSq.root",
        password: "2k5Lq94U8voiLkatA3uZ",
        database: "luminari_registry",
        ssl: { rejectUnauthorized: true },
      });

      try {
        const [workflows] = await connection.query(
          `SELECT * FROM workflow_pipeline LIMIT 50`
        );
        return workflows;
      } finally {
        await connection.end();
      }
    }),

  /**
   * Get all workflow steps
   * Raw data - no mapping
   */
  getWorkflowSteps: publicProcedure
    .query(async () => {
      const connection = await mysql.createConnection({
        host: "gateway04.us-east-1.prod.aws.tidbcloud.com",
        port: 4000,
        user: "2jhK1AfHyk6mXSq.root",
        password: "2k5Lq94U8voiLkatA3uZ",
        database: "luminari_registry",
        ssl: { rejectUnauthorized: true },
      });

      try {
        const [steps] = await connection.query(
          `SELECT * FROM workflow_step LIMIT 50`
        );
        return steps;
      } finally {
        await connection.end();
      }
    }),

  /**
   * Get all accountability routes
   * Raw data - no mapping
   */
  getAccountabilityPaths: publicProcedure
    .query(async () => {
      const connection = await mysql.createConnection({
        host: "gateway04.us-east-1.prod.aws.tidbcloud.com",
        port: 4000,
        user: "2jhK1AfHyk6mXSq.root",
        password: "2k5Lq94U8voiLkatA3uZ",
        database: "luminari_registry",
        ssl: { rejectUnauthorized: true },
      });

      try {
        const [paths] = await connection.query(
          `SELECT * FROM accountability_route LIMIT 50`
        );
        return paths;
      } finally {
        await connection.end();
      }
    }),

  /**
   * Get all legal statutes
   * Raw data - no mapping
   */
  getStatutes: publicProcedure
    .query(async () => {
      const connection = await mysql.createConnection({
        host: "gateway04.us-east-1.prod.aws.tidbcloud.com",
        port: 4000,
        user: "2jhK1AfHyk6mXSq.root",
        password: "2k5Lq94U8voiLkatA3uZ",
        database: "luminari_registry",
        ssl: { rejectUnauthorized: true },
      });

      try {
        const [statutes] = await connection.query(
          `SELECT * FROM legal_statutes LIMIT 50`
        );
        return statutes;
      } finally {
        await connection.end();
      }
    }),

  /**
   * Get all resources for the Resource Directory
   * Inline connection - no modules, no abstraction
   */
  getResources: publicProcedure
    .query(async () => {
      try {
        // Query agency_forms (canonical table)
        const [forms] = await pool.query(
          `SELECT id, formName as name, pipelineCategory as domain, agency as jurisdiction, link as url, filingDeadline
           FROM agency_forms
           LIMIT 100`
        ) as any[];

        // Query unified_resources for mental health resources
        const [mentalHealth] = await pool.query(
          `SELECT id, name, category as type, jurisdictionId as jurisdiction, phone, website, description as services_provided
           FROM unified_resources
           WHERE category = 'mental_behavioral_health'
           LIMIT 100`
        ) as any[];

        // Query registry_programs for agencies (oversight bodies)
        const [agencies] = await pool.query(
          `SELECT id, name_rp as name, category_rp as domain, agency_rp as jurisdiction, NULL as contact_methods, website_rp as website, agency_rp as description
           FROM registry_programs
           LIMIT 100`
        ) as any[];

        return {
          agencies: (agencies as any[]).map((a: any) => ({
            id: a.id,
            name: a.name,
            domain: a.domain || 'general',
            jurisdiction: a.jurisdiction || 'WA',
            phone: null,
            website: a.website,
            description: a.description,
          })),
          forms: (forms as any[]).map((f: any) => ({
            id: f.id,
            name: f.name,
            domain: f.domain || 'general',
            jurisdiction: f.jurisdiction || 'WA',
            url: f.url,
            description: f.filingDeadline ? `Deadline: ${f.filingDeadline}` : "No deadline specified",
          })),
          mentalHealth: (mentalHealth as any[]).map((r: any) => ({
            id: r.id,
            name: r.name,
            type: r.type,
            jurisdiction: r.jurisdiction,
            phone: null,
            website: r.website,
            description: r.servicesProvided || '',
            availability: "Check website",
          })),
        };
      } catch (err) {
        console.error('[getResources] Error:', err);
        return { agencies: [], forms: [], mentalHealth: [] };
      }
    }),
});
