/**
 * Knowledge Backbone Router
 *
 * Canonical read-only Knowledge Backbone plus Mission Control browse surfaces.
 * Browse procedures use parameterized PostgreSQL reads against the live schema;
 * they do not mutate interpretation packs or signal state.
 */

import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { getPool } from "../db";
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

const pageInput = z.object({
  search: z.string().trim().max(160).optional(),
  jurisdiction: z.string().trim().max(120).optional(),
  domain: z.string().trim().max(80).optional(),
  limit: z.number().int().min(1).max(100).default(25),
  offset: z.number().int().min(0).max(20_000).default(0),
});

type PagedPayload = { rows: Record<string, unknown>[]; total: number };

function pagedPayload(value: unknown): PagedPayload {
  if (!value || typeof value !== "object") return { rows: [], total: 0 };
  const candidate = value as { rows?: unknown; total?: unknown };
  return {
    rows: Array.isArray(candidate.rows)
      ? (candidate.rows as Record<string, unknown>[])
      : [],
    total: Number(candidate.total ?? 0),
  };
}

function normalizeJurisdiction(raw: string): string {
  const normalized = raw.trim();
  if (!normalized) return normalized;
  const stateMap: Record<string, string> = {
    j_alaska: "Alaska", j_american_samoa: "American Samoa", j_arizona: "Arizona",
    j_arkansas: "Arkansas", j_co: "Colorado", j_connecticut: "Connecticut",
    j_delaware: "Delaware", j_fl: "Florida", j_ga: "Georgia", j_guam: "Guam",
    j_hawaii: "Hawaii", j_idaho: "Idaho", j_il: "Illinois", j_in: "Indiana",
    j_iowa: "Iowa", j_kansas: "Kansas", j_louisiana: "Louisiana", j_maine: "Maine",
    j_maryland: "Maryland", j_massachusetts: "Massachusetts", j_mi: "Michigan",
    j_mississippi: "Mississippi", j_mn: "Minnesota", j_montana: "Montana",
    j_nebraska: "Nebraska", j_nevada: "Nevada", j_new_hampshire: "New Hampshire",
    j_new_jersey: "New Jersey", j_new_mexico: "New Mexico", j_nh: "New Hampshire",
    j_nj: "New Jersey", j_nm: "New Mexico", j_north_dakota: "North Dakota",
    j_northern_mariana_islands: "Northern Mariana Islands", j_ny: "New York",
    j_oh: "Ohio", j_oklahoma: "Oklahoma", j_pennsylvania: "Pennsylvania",
    j_puerto_rico: "Puerto Rico", j_rhode_island: "Rhode Island",
    j_south_dakota: "South Dakota", j_tx: "Texas", j_us_virgin_islands: "U.S. Virgin Islands",
    j_utah: "Utah", j_va: "Virginia", j_vermont: "Vermont", j_vi: "U.S. Virgin Islands",
    j_washington: "Washington", j_washington_dc: "Washington D.C.",
    j_wi: "Wisconsin", j_wv: "West Virginia", j_wyoming: "Wyoming",
  };
  if (/^j_/i.test(normalized)) {
    return stateMap[normalized.toLowerCase()] ?? normalized
      .replace(/^j_/i, "")
      .split("_")
      .map((part) => (part ? part[0].toUpperCase() + part.slice(1) : part))
      .join(" ");
  }
  return normalized.toLowerCase() === "federal" ? "Federal" : normalized;
}

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

  lookupClaim: protectedProcedure
    .input(z.object({ query: z.string() }))
    .query(async ({ input }) => lookupClaim(input.query)),

  routeToAgency: protectedProcedure
    .input(z.object({ claimType: z.string() }))
    .query(async ({ input }) => routeToAgency(input.claimType)),

  checkSOLCollision: protectedProcedure
    .input(z.object({ category: z.string() }))
    .query(async ({ input }) => checkSOLCollision(input.category)),

  cascadePathways: protectedProcedure
    .input(z.object({ trigger: z.string().optional() }))
    .query(async ({ input }) => getCascadePathways(input.trigger)),

  findGaps: protectedProcedure
    .input(z.object({ category: z.string().optional() }))
    .query(async ({ input }) => findGaps(input.category)),

  confidenceSpec: protectedProcedure.query(async () => getConfidenceEngineSpec()),

  policyEvents: protectedProcedure
    .input(z.object({ direction: z.string().optional(), type: z.string().optional() }))
    .query(async ({ input }) => getPolicyEvents(input)),

  // ── Mission Control Knowledge Backbone Explorer ───────────────
  // These replace the stale MySQL-style browse reads that silently rendered
  // failures as "No records found" despite populated PostgreSQL tables.

  browseStatutes: protectedProcedure.input(pageInput).query(async ({ input }) => {
    const { rows } = await getPool().query(
      `with filtered as (
         select id, jurisdiction, citation,
                coalesce(nullif(title,''), nullif(short_title,''), citation) as title,
                summary, domains, source_url, created_at
           from public.legal_statutes
          where ($1::text is null or
                 coalesce(title,'') ilike '%' || $1 || '%' or
                 coalesce(short_title,'') ilike '%' || $1 || '%' or
                 coalesce(citation,'') ilike '%' || $1 || '%' or
                 coalesce(summary,'') ilike '%' || $1 || '%')
            and ($2::text is null or jurisdiction = $2)
            and ($3::text is null or coalesce(domains,'[]'::jsonb)::text ilike '%' || $3 || '%')
       ), page as (
         select * from filtered
          order by created_at desc nulls last, citation, id
          limit $4 offset $5
       )
       select jsonb_build_object(
         'rows', coalesce((select jsonb_agg(to_jsonb(page)) from page), '[]'::jsonb),
         'total', (select count(*)::int from filtered)
       ) as payload`,
      [input.search ?? null, input.jurisdiction ?? null, input.domain ?? null, input.limit, input.offset],
    );
    return pagedPayload(rows[0]?.payload);
  }),

  browseCaseLaw: protectedProcedure.input(pageInput).query(async ({ input }) => {
    const { rows } = await getPool().query(
      `with filtered as (
         select id, case_name, citation, jurisdiction, court, summary,
                year_decided, key_quotes, domains, source_url, created_at
           from public.legal_case_law
          where ($1::text is null or
                 coalesce(case_name,'') ilike '%' || $1 || '%' or
                 coalesce(citation,'') ilike '%' || $1 || '%' or
                 coalesce(summary,'') ilike '%' || $1 || '%')
            and ($2::text is null or jurisdiction = $2)
            and ($3::text is null or coalesce(domains,'[]'::jsonb)::text ilike '%' || $3 || '%')
       ), page as (
         select * from filtered
          order by created_at desc nulls last, citation, id
          limit $4 offset $5
       )
       select jsonb_build_object(
         'rows', coalesce((select jsonb_agg(to_jsonb(page)) from page), '[]'::jsonb),
         'total', (select count(*)::int from filtered)
       ) as payload`,
      [input.search ?? null, input.jurisdiction ?? null, input.domain ?? null, input.limit, input.offset],
    );
    return pagedPayload(rows[0]?.payload);
  }),

  browseAgencies: protectedProcedure
    .input(pageInput.omit({ domain: true }))
    .query(async ({ input }) => {
      const { rows } = await getPool().query(
        `with filtered as (
           select id, agency_name, jurisdiction, domain, agency_type, website,
                  contact_methods, official_status, metadata, created_at
             from public.agencies_registry
            where ($1::text is null or
                   coalesce(agency_name,'') ilike '%' || $1 || '%' or
                   coalesce(jurisdiction,'') ilike '%' || $1 || '%' or
                   coalesce(domain,'') ilike '%' || $1 || '%')
              and ($2::text is null or jurisdiction = $2)
         ), page as (
           select * from filtered
            order by agency_name, id
            limit $3 offset $4
         )
         select jsonb_build_object(
           'rows', coalesce((select jsonb_agg(to_jsonb(page)) from page), '[]'::jsonb),
           'total', (select count(*)::int from filtered)
         ) as payload`,
        [input.search ?? null, input.jurisdiction ?? null, input.limit, input.offset],
      );
      return pagedPayload(rows[0]?.payload);
    }),

  browseCourts: protectedProcedure
    .input(z.object({
      search: z.string().trim().max(160).optional(),
      jurisdiction: z.string().trim().max(120).optional(),
      courtType: z.string().trim().max(120).optional(),
      limit: z.number().int().min(1).max(100).default(25),
      offset: z.number().int().min(0).max(20_000).default(0),
    }))
    .query(async ({ input }) => {
      const { rows } = await getPool().query(
        `with filtered as (
           select id,
                  agency_name_rob as court_name,
                  function_rob as court_type,
                  jurisdiction_id_rob as jurisdiction,
                  contact_rob as filing_portal,
                  pathway_rob as escalation_path,
                  statute_of_limitations_rob as sol,
                  created_at_rob as created_at
             from public.registry_oversight_bodies
            where ($1::text is null or
                   coalesce(agency_name_rob,'') ilike '%' || $1 || '%' or
                   coalesce(function_rob,'') ilike '%' || $1 || '%')
              and ($2::text is null or jurisdiction_id_rob = $2)
              and ($3::text is null or coalesce(function_rob,'') ilike '%' || $3 || '%')
         ), page as (
           select * from filtered
            order by created_at desc nulls last, court_name, id
            limit $4 offset $5
         )
         select jsonb_build_object(
           'rows', coalesce((select jsonb_agg(to_jsonb(page)) from page), '[]'::jsonb),
           'total', (select count(*)::int from filtered)
         ) as payload`,
        [input.search ?? null, input.jurisdiction ?? null, input.courtType ?? null, input.limit, input.offset],
      );
      return pagedPayload(rows[0]?.payload);
    }),

  browseAdvocacyTargets: protectedProcedure
    .input(z.object({
      search: z.string().trim().max(160).optional(),
      targetType: z.string().trim().max(120).optional(),
      limit: z.number().int().min(1).max(100).default(25),
      offset: z.number().int().min(0).max(20_000).default(0),
    }))
    .query(async ({ input }) => {
      const { rows } = await getPool().query(
        `with filtered as (
           select id,
                  name as target_name,
                  category as target_type,
                  coalesce(jurisdiction_id, jurisdiction_id_rp) as jurisdiction,
                  agency,
                  eligibility,
                  contact as contact_info,
                  website,
                  created_at
             from public.registry_programs
            where ($1::text is null or
                   coalesce(name,'') ilike '%' || $1 || '%' or
                   coalesce(agency,'') ilike '%' || $1 || '%' or
                   coalesce(eligibility,'') ilike '%' || $1 || '%')
              and ($2::text is null or coalesce(category,'') ilike '%' || $2 || '%')
         ), page as (
           select * from filtered
            order by created_at desc nulls last, target_name, id
            limit $3 offset $4
         )
         select jsonb_build_object(
           'rows', coalesce((select jsonb_agg(to_jsonb(page)) from page), '[]'::jsonb),
           'total', (select count(*)::int from filtered)
         ) as payload`,
        [input.search ?? null, input.targetType ?? null, input.limit, input.offset],
      );
      return pagedPayload(rows[0]?.payload);
    }),

  browseSettlementFormulas: protectedProcedure
    .input(z.object({
      search: z.string().trim().max(160).optional(),
      claimType: z.string().trim().max(120).optional(),
      limit: z.number().int().min(1).max(100).default(25),
      offset: z.number().int().min(0).max(20_000).default(0),
    }))
    .query(async ({ input }) => {
      const { rows } = await getPool().query(
        `with filtered as (
           select id, formula_id, formula_name, claim_type, jurisdiction,
                  formula_expression as base_multiplier,
                  variables, multiplier_ranges, statutory_basis,
                  notes as description, is_active, created_at
             from public.settlement_formulas
            where ($1::text is null or
                   coalesce(formula_name,'') ilike '%' || $1 || '%' or
                   coalesce(claim_type,'') ilike '%' || $1 || '%' or
                   coalesce(notes,'') ilike '%' || $1 || '%')
              and ($2::text is null or claim_type = $2)
         ), page as (
           select * from filtered
            order by created_at desc nulls last, formula_name, id
            limit $3 offset $4
         )
         select jsonb_build_object(
           'rows', coalesce((select jsonb_agg(to_jsonb(page)) from page), '[]'::jsonb),
           'total', (select count(*)::int from filtered)
         ) as payload`,
        [input.search ?? null, input.claimType ?? null, input.limit, input.offset],
      );
      return pagedPayload(rows[0]?.payload);
    }),

  getJurisdictions: protectedProcedure.query(async () => {
    const { rows } = await getPool().query(`
      select jurisdiction
        from (
          select jurisdiction from public.legal_statutes
          union select jurisdiction from public.legal_case_law
          union select jurisdiction from public.agencies_registry
          union select jurisdiction_id_rob as jurisdiction from public.registry_oversight_bodies
          union select coalesce(jurisdiction_id, jurisdiction_id_rp) as jurisdiction from public.registry_programs
          union select jurisdiction from public.settlement_formulas
        ) all_jurisdictions
       where jurisdiction is not null
         and btrim(jurisdiction) <> ''
         and lower(jurisdiction) <> 'state'
       order by jurisdiction
    `);
    const unique = new Set<string>();
    for (const row of rows as Array<{ jurisdiction: string }>) {
      unique.add(normalizeJurisdiction(row.jurisdiction));
    }
    return Array.from(unique).sort((a, b) =>
      a === "Federal" ? -1 : b === "Federal" ? 1 : a.localeCompare(b)
    );
  }),

  getDomains: protectedProcedure.query(async () => {
    const { rows } = await getPool().query(`
      select domains from public.legal_statutes where domains is not null
      union select domains from public.legal_case_law where domains is not null
    `);
    const domainSet = new Set<string>();
    for (const row of rows as Array<{ domains: unknown }>) {
      const value = row.domains;
      if (Array.isArray(value)) {
        for (const domain of value) {
          if (typeof domain === "string" && domain.trim()) domainSet.add(domain.trim());
        }
      } else if (typeof value === "string" && value.trim()) {
        try {
          const parsed = JSON.parse(value);
          if (Array.isArray(parsed)) {
            for (const domain of parsed) {
              if (typeof domain === "string" && domain.trim()) domainSet.add(domain.trim());
            }
          } else {
            domainSet.add(value.trim());
          }
        } catch {
          domainSet.add(value.trim());
        }
      }
    }
    return Array.from(domainSet).sort();
  }),
});
