/**
 * Registry Router
 * tRPC procedures for querying forms, agencies, escalation paths, and mental health resources
 */
import { router, publicProcedure } from "../_core/trpc";
import { z } from "zod";
import { query_with_diagnostics } from "../db";
import {
  get_live_registry_agency,
  get_live_registry_form,
  list_live_escalation_paths,
  list_live_registry_agencies,
  list_live_registry_forms,
  mental_health_resources_unavailable,
} from "../registry-live-read-compat";

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
      return list_live_registry_forms({
        domain: input.domain,
        jurisdiction: input.jurisdiction,
      });
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
      return list_live_registry_forms({
        search: input.query,
        domain: input.domain,
      });
    }),

  /**
   * Get a specific form by ID
   */
  getFormById: publicProcedure
    .input(z.object({ formId: z.string().uuid() }))
    .query(async ({ input }) => {
      return get_live_registry_form(input.formId);
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
      return list_live_registry_agencies({
        domain: input.domain,
        jurisdiction: input.jurisdiction,
      });
    }),

  /**
   * Get a specific agency by ID
   */
  getAgencyById: publicProcedure
    .input(z.object({ agencyId: z.string().nullish() }))
    .query(async ({ input }) => {
      if (!input.agencyId) return null;
      return get_live_registry_agency(input.agencyId);
    }),

  /**
   * Get all forms for a specific agency
   */
  getFormsByAgency: publicProcedure
    .input(z.object({ agencyId: z.string() }))
    .query(async ({ input }) => {
      return list_live_registry_forms({ agencyId: input.agencyId });
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
      return list_live_escalation_paths({
        agencyId: input.agencyId,
        direction: "from",
        domain: input.domain,
      });
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
      return list_live_escalation_paths({
        agencyId: input.agencyId,
        direction: "to",
        domain: input.domain,
      });
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
      return list_live_escalation_paths({
        domain: input.domain,
        jurisdiction: input.jurisdiction,
      });
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
      return {
        ...mental_health_resources_unavailable,
        requestedFilters: input,
      };
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
      return {
        ...mental_health_resources_unavailable,
        requestedFilters: input,
      };
    }),

  /**
   * Get a specific mental health resource by ID
   */
  getMentalHealthResourceById: publicProcedure
    .input(z.object({ resourceId: z.string() }))
    .query(async ({ input }) => {
      return {
        ...mental_health_resources_unavailable,
        resource: null,
        requestedResourceId: input.resourceId,
      };
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
      const [agencies, forms, escalations] = await Promise.all([
        list_live_registry_agencies({
          domain: input.domain,
          jurisdiction: input.jurisdiction,
        }),
        list_live_registry_forms({
          domain: input.domain,
          jurisdiction: input.jurisdiction,
        }),
        list_live_escalation_paths({
          domain: input.domain,
          jurisdiction: input.jurisdiction,
        }),
      ]);

      const escalationPaths = escalations.paths;

      return {
        domain: input.domain,
        jurisdiction: input.jurisdiction || "NATIONAL",
        agencies,
        forms,
        escalations: escalationPaths,
        summary: {
          agencyCount: agencies.length,
          formCount: forms.length,
          escalationCount: escalationPaths.length,
          agency_count: agencies.length,
          form_count: forms.length,
          escalation_count: escalationPaths.length,
        },
        availability: {
          forms: { available: true, source: "forms_registry" },
          agencies: { available: true, source: "agencies_registry" },
          escalations: {
            available: escalations.available,
            state: escalations.state,
            reason: escalations.reason,
            message: escalations.message,
            source: "escalation_registry",
            jurisdictionFilterAvailable: false,
            domainFilterAvailable: false,
          },
        },
      };
    }),

  /**
   * Get canonical workflows from the production Supabase registry.
   */
  getWorkflows: publicProcedure
    .query(async () => {
      const result = await query_with_diagnostics(
        `select * from public.workflow_master order by title, id limit 50`,
        [],
        { label: "registry_workflow_master" },
      );
      return result.rows;
    }),

  /**
   * Get canonical workflow steps from the production Supabase registry.
   */
  getWorkflowSteps: publicProcedure
    .query(async () => {
      const result = await query_with_diagnostics(
        `select * from public.workflow_steps
          order by workflow_id, coalesce(step_order, step_number, 0), id
          limit 50`,
        [],
        { label: "registry_workflow_steps" },
      );
      return result.rows;
    }),

  /**
   * Get canonical escalation/accountability routes.
   */
  getAccountabilityPaths: publicProcedure
    .query(async () => {
      const result = await query_with_diagnostics(
        `select * from public.escalation_routes order by workflow_id, id limit 50`,
        [],
        { label: "registry_escalation_routes" },
      );
      return result.rows;
    }),

  /**
   * Get canonical legal statutes.
   */
  getStatutes: publicProcedure
    .query(async () => {
      const result = await query_with_diagnostics(
        `select * from public.legal_statutes order by id limit 50`,
        [],
        { label: "registry_legal_statutes" },
      );
      return result.rows;
    }),

  /**
   * Get bounded resource projections from the canonical Supabase registry.
   */
  getResources: publicProcedure
    .query(async () => {
      try {
        const result = await query_with_diagnostics<{
          forms: any[];
          mental_health: any[];
          agencies: any[];
        }>(
          `select
             coalesce((
               select jsonb_agg(to_jsonb(f) order by f.agency, f.form_name, f.id)
                 from (
                   select id, form_name, pipeline_category, agency, link, filing_deadline
                     from public.agency_forms
                    order by agency, form_name, id
                    limit 100
                 ) f
             ), '[]'::jsonb) as forms,
             coalesce((
               select jsonb_agg(to_jsonb(r) order by r.name, r.id)
                 from (
                   select id, name, category, resource_type, state_code,
                          jurisdiction_id, phone, website, description
                     from public.unified_resources
                    where category = 'mental_behavioral_health'
                    order by name, id
                    limit 100
                 ) r
             ), '[]'::jsonb) as mental_health,
             coalesce((
               select jsonb_agg(to_jsonb(p) order by p.name, p.id)
                 from (
                   select id, name, category, agency, jurisdiction_id,
                          contact_phone_norm, website, apply_notes
                     from public.registry_programs
                    order by name, id
                    limit 100
                 ) p
             ), '[]'::jsonb) as agencies`,
          [],
          { label: "registry_resources_snapshot" },
        );
        const snapshot = result.rows[0] ?? { forms: [], mental_health: [], agencies: [] };

        return {
          agencies: snapshot.agencies.map((a: any) => ({
            id: a.id,
            name: a.name,
            domain: a.category || 'general',
            jurisdiction: a.jurisdiction_id || a.agency || 'NATIONAL',
            phone: a.contact_phone_norm,
            website: a.website,
            description: a.apply_notes || a.agency,
          })),
          forms: snapshot.forms.map((f: any) => ({
            id: f.id,
            name: f.form_name,
            domain: f.pipeline_category || 'general',
            jurisdiction: f.agency || 'NATIONAL',
            url: f.link,
            description: f.filing_deadline ? `Deadline: ${f.filing_deadline}` : "No deadline specified",
          })),
          mental_health: snapshot.mental_health.map((r: any) => ({
            id: r.id,
            name: r.name,
            type: r.category || r.resource_type,
            jurisdiction: r.state_code || r.jurisdiction_id,
            phone: r.phone,
            website: r.website,
            description: r.description || '',
            availability: "Check website",
          })),
        };
      } catch (err) {
        console.error('[getResources] Error:', err);
        return { agencies: [], forms: [], mental_health: [] };
      }
    }),
});
