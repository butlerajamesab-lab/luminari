import { z } from "zod";
import { router, publicProcedure } from "../_core/trpc";
import { db, query_with_diagnostics } from "../db";
import {
  agencyPerformanceMetrics,
  legalWeakJoints,
} from "../../drizzle/schema";
import { eq, desc, sql, like } from "drizzle-orm";

export const agencyMetricsRouter = router({
  // Person-facing agency/oversight directory from the current governed civic
  // object projection. This deliberately does not fall back to World Index,
  // whose `agency` bucket mixes statutes, programs, reforms, and contacts.
  listCanonicalAgencies: publicProcedure
    .input(
      z
        .object({
          query: z.string().trim().max(160).optional(),
          jurisdiction: z.string().trim().max(64).optional(),
          limit: z.number().int().min(1).max(64).default(16),
        })
        .optional(),
    )
    .query(async ({ input }) => {
      const limit = input?.limit ?? 16;
      const params: unknown[] = [];
      const conditions = [
        "object_class in ('agency','oversight_body')",
        "typed_ready is true",
        "jurisdiction_ready is true",
        "coalesce(category,'') <> 'workbook_context'",
        "coalesce(source_object_type,'') <> 'workbook_context'",
        "coalesce(nullif(btrim(name),''),nullif(btrim(organization_name),'')) is not null",
      ];

      if (input?.query) {
        params.push(`%${input.query}%`);
        const value = `$${params.length}`;
        conditions.push(`(
          coalesce(name,'') ilike ${value}
          or coalesce(organization_name,'') ilike ${value}
          or coalesce(description,'') ilike ${value}
          or coalesce(category,'') ilike ${value}
          or coalesce(layer,'') ilike ${value}
          or coalesce(statutory_authority,'') ilike ${value}
        )`);
      }
      if (input?.jurisdiction) {
        params.push(input.jurisdiction.toUpperCase());
        conditions.push(
          `upper(coalesce(nullif(btrim(state_code),''),nullif(btrim(jurisdiction),'')))=$${params.length}`,
        );
      }

      params.push(limit + 1);
      const result = await query_with_diagnostics<any>(
        `with eligible as materialized (
           select
             civic_object_uid::text as canonical_id,
             object_ref,
             object_class,
             coalesce(nullif(btrim(name),''),nullif(btrim(organization_name),'')) as display_name,
             upper(coalesce(nullif(btrim(state_code),''),nullif(btrim(jurisdiction),''))) as jurisdiction_code,
             description,category,layer,phone,email,website_url,statutory_authority,
             source_locator,source_content_sha256,source_candidate_hash,current_run_engine_version,
             current_run_completed_at,reconciled_at,
             count(*) over (
               partition by
                 lower(regexp_replace(btrim(coalesce(nullif(name,''),nullif(organization_name,''),'')),'[[:space:]]+',' ','g')),
                 upper(coalesce(nullif(btrim(state_code),''),nullif(btrim(jurisdiction),'')))
             )::int as source_variant_count,
             array_agg(object_ref) over (
               partition by
                 lower(regexp_replace(btrim(coalesce(nullif(name,''),nullif(organization_name,''),'')),'[[:space:]]+',' ','g')),
                 upper(coalesce(nullif(btrim(state_code),''),nullif(btrim(jurisdiction),'')))
               order by object_ref
               rows between unbounded preceding and unbounded following
             ) as source_variant_refs,
             row_number() over (
               partition by
                 lower(regexp_replace(btrim(coalesce(nullif(name,''),nullif(organization_name,''),'')),'[[:space:]]+',' ','g')),
                 upper(coalesce(nullif(btrim(state_code),''),nullif(btrim(jurisdiction),'')))
               order by
                 case when object_class='oversight_body' then 0 else 1 end,
                 current_run_completed_at desc nulls last,
                 reconciled_at desc nulls last,
                 object_ref
             ) as display_rank
           from public.v_lighthouse_workflow_accountability_catalog_v1
          where ${conditions.join(" and ")}
        )
        select canonical_id,object_ref,object_class,display_name,jurisdiction_code,
               description,category,layer,phone,email,website_url,statutory_authority,
               source_locator,source_content_sha256,source_candidate_hash,current_run_engine_version,
               current_run_completed_at,reconciled_at,source_variant_count,source_variant_refs
          from eligible
         where display_rank=1
         order by lower(display_name),jurisdiction_code,object_ref
         limit $${params.length}`,
        params,
        {
          label: "agency_metrics_canonical_directory",
          pool_acquire_timeout_ms: 1_000,
          query_timeout_ms: 7_000,
        },
      );

      const hasMore = result.rows.length > limit;
      return {
        items: result.rows.slice(0, limit),
        limit,
        has_more: hasMore,
        projection_contract: "lighthouse_workflow_accountability_catalog_v1",
      };
    }),

  // Get all agencies with their latest year data
  listAgencies: publicProcedure.query(async () => {
    const rows = await db
      .select({
        agencyName: agencyPerformanceMetrics.agencyName,
        agencyAbbreviation: agencyPerformanceMetrics.agencyAbbreviation,
        jurisdiction: agencyPerformanceMetrics.jurisdiction,
        statutoryAuthority: agencyPerformanceMetrics.statutoryAuthority,
      })
      .from(agencyPerformanceMetrics)
      .groupBy(
        agencyPerformanceMetrics.agencyName,
        agencyPerformanceMetrics.agencyAbbreviation,
        agencyPerformanceMetrics.jurisdiction,
        agencyPerformanceMetrics.statutoryAuthority,
      );
    return rows;
  }),

  // Get all yearly data for a specific agency
  getAgencyTimeline: publicProcedure
    .input(z.object({ agencyName: z.string() }))
    .query(async ({ input }) => {
      const rows = await db
        .select()
        .from(agencyPerformanceMetrics)
        .where(eq(agencyPerformanceMetrics.agencyName, input.agencyName))
        .orderBy(desc(agencyPerformanceMetrics.fiscalYear));
      return rows;
    }),

  // Get all metrics (all agencies, all years)
  getAll: publicProcedure.query(async () => {
    const rows = await db
      .select()
      .from(agencyPerformanceMetrics)
      .orderBy(
        agencyPerformanceMetrics.agencyName,
        desc(agencyPerformanceMetrics.fiscalYear),
      );
    return rows;
  }),

  // Get weak joints related to an agency (by matching statuteCitation keywords)
  getAgencyWeakJoints: publicProcedure
    .input(z.object({ agencyName: z.string() }))
    .query(async ({ input }) => {
      // Map agency names to statute citation patterns
      const citationPatterns: Record<string, string[]> = {
        "Equal Employment Opportunity Commission": [
          "2000e",
          "Title VII",
          "ADA",
          "ADEA",
          "EPA",
          "GINA",
        ],
        "HUD Office of Fair Housing": ["3601", "3604", "3605", "Fair Housing"],
        "DOL Wage and Hour Division": ["FLSA", "206", "207", "212", "213"],
        "HHS Office for Civil Rights": ["HIPAA", "1557", "Civil Rights Act"],
        "SSA Office of Disability": ["423", "1382", "Social Security"],
        "EPA Office of Enforcement": [
          "7401",
          "Clean Air",
          "Clean Water",
          "CERCLA",
        ],
      };
      const patterns = citationPatterns[input.agencyName] || [input.agencyName];
      const conditions = patterns.map((p) =>
        like(legalWeakJoints.statuteCitation, `%${p}%`),
      );
      const rows = await db
        .select()
        .from(legalWeakJoints)
        .where(
          conditions.length === 1
            ? conditions[0]
            : sql`(${sql.join(conditions, sql` OR `)})`,
        )
        .orderBy(desc(legalWeakJoints.severity))
        .limit(20);
      return rows;
    }),

  // Summary stats
  stats: publicProcedure.query(async () => {
    const [agencyCount] = await db
      .select({
        count: sql<number>`COUNT(DISTINCT agencyName)`,
      })
      .from(agencyPerformanceMetrics);
    const [yearCount] = await db
      .select({
        count: sql<number>`COUNT(DISTINCT fiscalYear)`,
      })
      .from(agencyPerformanceMetrics);
    const [totalRows] = await db
      .select({
        count: sql<number>`COUNT(*)`,
      })
      .from(agencyPerformanceMetrics);
    return {
      agencies: agencyCount?.count ?? 0,
      years: yearCount?.count ?? 0,
      total_data_points: totalRows?.count ?? 0,
    };
  }),
});
