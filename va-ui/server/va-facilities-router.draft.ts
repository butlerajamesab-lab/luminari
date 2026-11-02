/**
 * VA Facilities Router — DRAFT (2026-10-30, not wired, not live).
 *
 * Modeled on server/routers/legislators-router.ts. Citizen-facing
 * read-only directory for VA facilities, in the veterans area.
 *
 * Reads only from public.va_facilities and public.va_facility_services
 * (new-format tables, seeded from the receipted VA Facilities API
 * baseline pull). These tables are NOT in drizzle/schema.ts, so all
 * reads use raw parameterized SQL via db.execute(sql`...`). Every
 * user-supplied value is passed as a drizzle sql-template parameter —
 * never interpolated into a SQL string.
 *
 * Scope discipline (the legislators rule): the resolver answers
 * state + type + city/ZIP questions only. There is no procedure that
 * returns the national roster. An unknown scope returns held: true
 * with the valid list, never an unscoped dump and never a bare empty
 * result. Every resolve is capped at 100 rows. Default results
 * exclude operating_status = 'CLOSED'; closed rows remain in the
 * base and are labeled wherever they surface.
 *
 * This router makes ZERO external calls. The VA API is the
 * reconciler at refresh time, never the page's engine.
 */
import { z } from "zod";
import { router, publicProcedure } from "../_core/trpc";
import { sql } from "drizzle-orm";
import { db } from "../db";

const FACILITY_TYPES: Record<string, string> = {
  va_health_facility: "Health",
  va_benefits_facility: "Benefits",
  va_cemetery: "Cemeteries",
  vet_center: "Vet Centers",
};

const RESULT_CAP = 100;

export const vaFacilitiesRouter = router({
  /** Jurisdictions present in the base, with counts. */
  states: publicProcedure.query(async () => {
    const rows = await db.execute(sql`
      SELECT physical_state AS state, COUNT(*)::int AS count
      FROM public.va_facilities
      WHERE physical_state IS NOT NULL
      GROUP BY physical_state
      ORDER BY physical_state
    `);
    return rows;
  }),

  /** The four facility types, with counts, optionally per state. */
  types: publicProcedure
    .input(z.object({ state: z.string().length(2).optional() }))
    .query(async ({ input }) => {
      const rows = await db.execute(sql`
        SELECT facility_type, COUNT(*)::int AS count
        FROM public.va_facilities
        WHERE (${input.state ?? null}::text IS NULL OR physical_state = ${input.state ?? null})
        GROUP BY facility_type
        ORDER BY facility_type
      `);
      return rows.map((r: any) => ({
        ...r,
        label: FACILITY_TYPES[r.facility_type as string] ?? r.facility_type,
      }));
    }),

  /** Cities for a state + type scope, with counts. */
  cities: publicProcedure
    .input(
      z.object({
        state: z.string().length(2),
        type: z.string().min(1),
      }),
    )
    .query(async ({ input }) => {
      const rows = await db.execute(sql`
        SELECT physical_city AS city, COUNT(*)::int AS count
        FROM public.va_facilities
        WHERE physical_state = ${input.state}
          AND facility_type = ${input.type}
          AND physical_city IS NOT NULL
        GROUP BY physical_city
        ORDER BY physical_city
      `);
      return rows;
    }),

  /**
   * The scoped resolve. Requires state + type. Narrows by city or
   * ZIP when given. Unknown state/type/city returns held: true with
   * the valid list for that step — the legislators held pattern.
   */
  resolve: publicProcedure
    .input(
      z.object({
        state: z.string().length(2),
        type: z.string().min(1),
        city: z.string().min(1).optional(),
        zip: z.string().min(3).max(10).optional(),
        includeClosed: z.boolean().default(false),
      }),
    )
    .query(async ({ input }) => {
      const validTypes = await db.execute(sql`
        SELECT DISTINCT facility_type FROM public.va_facilities
        WHERE physical_state = ${input.state}
      `);
      if (validTypes.length === 0) {
        const states = await db.execute(sql`
          SELECT DISTINCT physical_state AS state FROM public.va_facilities
          WHERE physical_state IS NOT NULL ORDER BY physical_state
        `);
        return { held: true as const, step: "state", valid: states };
      }
      if (!validTypes.some((r: any) => r.facility_type === input.type)) {
        return {
          held: true as const,
          step: "type",
          valid: validTypes.map((r: any) => ({
            facility_type: r.facility_type,
            label: FACILITY_TYPES[r.facility_type as string] ?? r.facility_type,
          })),
        };
      }
      if (input.city) {
        const cityRows = await db.execute(sql`
          SELECT DISTINCT physical_city AS city FROM public.va_facilities
          WHERE physical_state = ${input.state}
            AND facility_type = ${input.type}
            AND physical_city IS NOT NULL
          ORDER BY physical_city
        `);
        if (!cityRows.some((r: any) => r.city === input.city)) {
          return { held: true as const, step: "city", valid: cityRows };
        }
      }
      const rows = await db.execute(sql`
        SELECT facility_key, name, facility_type, classification,
               operating_status, phone_main, website_url,
               physical_address1, physical_city, physical_state,
               physical_zip, latitude, longitude, is_mobile,
               source, fetched_date, verification_status,
               hold_flag, hold_reason
        FROM public.va_facilities
        WHERE physical_state = ${input.state}
          AND facility_type = ${input.type}
          AND (${input.city ?? null}::text IS NULL OR physical_city = ${input.city ?? null})
          AND (${input.zip ?? null}::text IS NULL OR physical_zip = ${input.zip ?? null})
          AND (${input.includeClosed}::boolean OR operating_status <> 'CLOSED')
        ORDER BY name
        LIMIT ${RESULT_CAP}
      `);
      return { held: false as const, facilities: rows };
    }),

  /** One facility by key, with its services — the detail path. */
  facility: publicProcedure
    .input(z.object({ facilityKey: z.string().min(1) }))
    .query(async ({ input }) => {
      const rows = await db.execute(sql`
        SELECT * FROM public.va_facilities
        WHERE facility_key = ${input.facilityKey}
        LIMIT 1
      `);
      if (rows.length === 0) return { held: true as const, step: "facility" };
      const services = await db.execute(sql`
        SELECT service_id, service_name, service_link
        FROM public.va_facility_services
        WHERE facility_key = ${input.facilityKey}
        ORDER BY service_name
      `);
      return { held: false as const, facility: rows[0], services };
    }),

  /** Coverage face labels: totals and last refresh. */
  meta: publicProcedure.query(async () => {
    const rows = await db.execute(sql`
      SELECT COUNT(*)::int AS facilities,
             COUNT(DISTINCT physical_state)::int AS jurisdictions,
             MAX(fetched_date) AS last_refreshed
      FROM public.va_facilities
    `);
    return rows[0];
  }),
});
