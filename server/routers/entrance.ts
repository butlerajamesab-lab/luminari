import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, authenticatedProcedure } from "../_core/trpc";
import { query_with_diagnostics } from "../db";

// The Entrance (2026-11-27): a signed-in user's self-declared worker kind.
// This is a lens label only — it never reads or writes users.role, which
// stays invite/admin-controlled. Help-seekers use no procedure here at all:
// the seeker path through the entrance page writes nothing.
//
// Government entrants must identify: branch agency | legislative. The agency
// branch either picks from the canonical agency directory (the governed view
// behind agencyMetrics.listCanonicalAgencies — same eligibility filter, so a
// canonical id is only ever accepted when that read can see it) or types a
// name that is stored as UNVERIFIED text; unverified text never touches the
// canonical id/name fields and is never minted into the directory.

const ENTRANT_KINDS = ["advocate", "legal", "education", "government"] as const;
const GOV_BRANCHES = ["agency", "legislative"] as const;

type EntrantKind = (typeof ENTRANT_KINDS)[number];
type GovBranch = (typeof GOV_BRANCHES)[number];

export interface EntranceProfileView {
  entrantKind: EntrantKind | null;
  govBranch: GovBranch | null;
  agencyCanonicalId: string | null;
  agencyDisplayName: string | null;
  agencyTextUnverified: string | null;
  createdAt: number;
  updatedAt: number;
}

interface EntranceProfileRow {
  entrant_kind: EntrantKind | null;
  gov_branch: GovBranch | null;
  agency_canonical_id: string | null;
  agency_display_name: string | null;
  agency_text_unverified: string | null;
  created_at: number | string;
  updated_at: number | string;
}

function to_view(row: EntranceProfileRow): EntranceProfileView {
  return {
    entrantKind: row.entrant_kind,
    govBranch: row.gov_branch,
    agencyCanonicalId: row.agency_canonical_id,
    agencyDisplayName: row.agency_display_name,
    agencyTextUnverified: row.agency_text_unverified,
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
  };
}

function caller_user_id(ctx: { user?: { id?: unknown } | null }): number {
  const id = ctx.user?.id;
  if (typeof id !== "number" || !Number.isFinite(id)) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Sign in to use the entrance." });
  }
  return id;
}

// The canonical agency directory eligibility filter, kept in step with
// agencyMetrics.listCanonicalAgencies: an agency the directory cannot show
// cannot be picked at the entrance either.
const CANONICAL_AGENCY_CONDITIONS = [
  "object_class in ('agency','oversight_body')",
  "typed_ready is true",
  "jurisdiction_ready is true",
  "coalesce(category,'') <> 'workbook_context'",
  "coalesce(source_object_type,'') <> 'workbook_context'",
  "coalesce(nullif(btrim(name),''),nullif(btrim(organization_name),'')) is not null",
];

interface CanonicalAgencyRow {
  canonical_id: string;
  display_name: string;
  jurisdiction_code: string | null;
}

async function find_canonical_agency(canonical_id: string): Promise<CanonicalAgencyRow | null> {
  const result = await query_with_diagnostics<CanonicalAgencyRow>(
    `select civic_object_uid::text as canonical_id,
            coalesce(nullif(btrim(name),''),nullif(btrim(organization_name),'')) as display_name,
            upper(coalesce(nullif(btrim(state_code),''),nullif(btrim(jurisdiction),''))) as jurisdiction_code
       from public.v_lighthouse_workflow_accountability_catalog_v1
      where civic_object_uid::text = $1
        and ${CANONICAL_AGENCY_CONDITIONS.join(" and ")}
      limit 1`,
    [canonical_id],
    { label: "entrance_agency_lookup", pool_acquire_timeout_ms: 1_000, query_timeout_ms: 7_000 },
  );
  return result.rows[0] ?? null;
}

const PROFILE_COLUMNS =
  "entrant_kind, gov_branch, agency_canonical_id, agency_display_name, agency_text_unverified, created_at, updated_at";

export const entranceRouter = router({
  getMine: authenticatedProcedure.query(async ({ ctx }) => {
    const user_id = caller_user_id(ctx);
    const result = await query_with_diagnostics<EntranceProfileRow>(
      `select ${PROFILE_COLUMNS}
         from public.entrance_profiles
        where user_id = $1
        limit 1`,
      [user_id],
      { label: "entrance_profile_get_mine", pool_acquire_timeout_ms: 1_000, query_timeout_ms: 7_000 },
    );
    const row = result.rows[0];
    return row ? to_view(row) : null;
  }),

  setMine: authenticatedProcedure
    .input(
      z.object({
        entrantKind: z.enum(ENTRANT_KINDS),
        govBranch: z.enum(GOV_BRANCHES).optional(),
        agencyCanonicalId: z.string().trim().max(200).optional(),
        agencyText: z.string().trim().max(200).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const user_id = caller_user_id(ctx);

      // Normalize the declaration. Anything outside the caller's own kind is
      // cleared, never carried: non-government kinds drop every gov field,
      // the legislative branch drops every agency field.
      let gov_branch: GovBranch | null = null;
      let agency_canonical_id: string | null = null;
      let agency_display_name: string | null = null;
      let agency_text_unverified: string | null = null;

      if (input.entrantKind === "government") {
        if (!input.govBranch) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Government entrants choose a branch: agency or legislative.",
          });
        }
        gov_branch = input.govBranch;

        if (gov_branch === "agency") {
          const canonical_id = input.agencyCanonicalId?.trim() || null;
          const agency_text = input.agencyText?.trim() || null;
          if ((canonical_id === null) === (agency_text === null)) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "Agency entrants pick their agency from the directory or type it as unverified text — exactly one of the two.",
            });
          }
          if (canonical_id !== null) {
            const agency = await find_canonical_agency(canonical_id);
            if (!agency) {
              throw new TRPCError({
                code: "BAD_REQUEST",
                message: "That agency is not in the canonical directory.",
              });
            }
            agency_canonical_id = agency.canonical_id;
            agency_display_name = agency.display_name;
          } else {
            agency_text_unverified = agency_text;
          }
        }
      }

      const now = Date.now();
      const result = await query_with_diagnostics<EntranceProfileRow>(
        `insert into public.entrance_profiles (
           user_id, entrant_kind, gov_branch,
           agency_canonical_id, agency_display_name, agency_text_unverified,
           created_at, updated_at
         ) values ($1, $2, $3, $4, $5, $6, $7, $7)
         on conflict (user_id) do update set
           entrant_kind = excluded.entrant_kind,
           gov_branch = excluded.gov_branch,
           agency_canonical_id = excluded.agency_canonical_id,
           agency_display_name = excluded.agency_display_name,
           agency_text_unverified = excluded.agency_text_unverified,
           updated_at = excluded.updated_at
         returning ${PROFILE_COLUMNS}`,
        [
          user_id,
          input.entrantKind,
          gov_branch,
          agency_canonical_id,
          agency_display_name,
          agency_text_unverified,
          now,
        ],
        { label: "entrance_profile_set_mine", pool_acquire_timeout_ms: 1_000, query_timeout_ms: 7_000 },
      );
      return to_view(result.rows[0]);
    }),

  searchAgencies: authenticatedProcedure
    .input(z.object({ query: z.string().trim().min(1).max(160) }))
    .query(async ({ input }) => {
      const result = await query_with_diagnostics<CanonicalAgencyRow>(
        `with eligible as materialized (
           select
             civic_object_uid::text as canonical_id,
             coalesce(nullif(btrim(name),''),nullif(btrim(organization_name),'')) as display_name,
             upper(coalesce(nullif(btrim(state_code),''),nullif(btrim(jurisdiction),''))) as jurisdiction_code,
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
          where ${CANONICAL_AGENCY_CONDITIONS.join(" and ")}
            and (
              coalesce(name,'') ilike $1
              or coalesce(organization_name,'') ilike $1
              or coalesce(description,'') ilike $1
              or coalesce(category,'') ilike $1
              or coalesce(layer,'') ilike $1
              or coalesce(statutory_authority,'') ilike $1
            )
        )
        select canonical_id, display_name, jurisdiction_code
          from eligible
         where display_rank = 1
         order by lower(display_name), jurisdiction_code
         limit 20`,
        [`%${input.query}%`],
        { label: "entrance_agency_search", pool_acquire_timeout_ms: 1_000, query_timeout_ms: 7_000 },
      );
      return result.rows.map((row) => ({
        canonical_id: row.canonical_id,
        display_name: row.display_name,
        jurisdiction_code: row.jurisdiction_code,
      }));
    }),
});
