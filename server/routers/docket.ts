/**
 * Docket Room — tRPC Router
 *
 * Structural legislative analysis module.
 * Core Principle: Reveal structure. Interpret nothing. Judge nothing. Persuade no one.
 *
 * Sections per law:
 * 1. Plain-Language Summary
 * 2. Actor Ledger
 * 3. Impact Grid
 * 4. Implementation Dock
 * 5. Loophole Lantern
 * 6. Comparative Bay
 * 7. Source Ledger
 */
import { z } from "zod";
import { router, publicProcedure, protectedProcedure, adminProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import {
  create_live_docket_entry,
  delete_live_docket_entry,
  get_live_docket_entry,
  get_live_docket_entry_by_slug,
  get_live_docket_stats,
  list_live_docket_entries,
  update_live_docket_entry,
} from "../docket-live-read-compat";

// ─── Input Schemas ───

const docketDateInput = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, {
  message: "Expected an ISO calendar date (YYYY-MM-DD)",
});

const docketEntryInput = z.object({
  slug: z.string().min(1).max(256),
  title: z.string().min(1).max(512),
  shortTitle: z.string().max(256).optional(),
  jurisdiction: z.string().min(1).max(128),
  jurisdictionLevel: z.enum(["federal", "state", "county", "city", "tribal"]),
  lawType: z.enum(["statute", "ordinance", "regulation", "executive_order", "ballot_measure", "proposed_bill", "constitutional_amendment"]),
  status: z.enum(["enacted", "proposed", "repealed", "amended", "under_review"]),
  dateIntroduced: docketDateInput.optional(),
  dateEnacted: docketDateInput.optional(),
  dateEffective: docketDateInput.optional(),
  summary: z.string().optional(),
  keyChanges: z.array(z.string()).optional(),
  implementationAgencies: z.array(z.string()).optional(),
  adminSteps: z.array(z.string()).optional(),
  complianceObligations: z.array(z.string()).optional(),
  rolloutTimeline: z.array(z.string()).optional(),
  structuralExemptions: z.array(z.string()).optional(),
  enforcementGaps: z.array(z.string()).optional(),
  reportingGaps: z.array(z.string()).optional(),
  delegatedAuthority: z.array(z.string()).optional(),
  similarLaws: z.array(z.object({ jurisdiction: z.string(), title: z.string(), note: z.string() })).optional(),
  historicalPrecedents: z.array(z.object({ title: z.string(), year: z.string(), note: z.string() })).optional(),
  implementationVariations: z.array(z.string()).optional(),
  primarySourceUrl: z.string().optional(),
});

const actorInput = z.object({
  actorName: z.string().min(1).max(512),
  actorType: z.enum([
    "sponsor", "cosponsor", "committee", "implementing_agency",
    "regulatory_body", "lobbyist_org", "advocacy_group", "opposition_group",
    "executive_signatory", "judicial_body"
  ]),
  role: z.string().optional(),
  affiliation: z.string().optional(),
  sourceUrl: z.string().optional(),
  sourceNote: z.string().optional(),
});

const impactInput = z.object({
  impactCategory: z.enum(["population", "industry", "government_agency", "geographic"]),
  affectedEntity: z.string().min(1).max(512),
  impactDescription: z.string().optional(),
  scope: z.string().optional(),
  sourceUrl: z.string().optional(),
  sourceNote: z.string().optional(),
});

const sourceInput = z.object({
  sourceType: z.enum([
    "legislation_text", "committee_report", "agency_rule", "court_decision",
    "federal_register", "congressional_record", "state_legislature",
    "executive_order", "press_release", "government_report", "other"
  ]),
  title: z.string().min(1).max(512),
  url: z.string().optional(),
  citation: z.string().optional(),
  accessDate: z.string().optional(),
  note: z.string().optional(),
});

const liveDocketEntryId = z.string().uuid();

const docketSubmissionAvailability = {
  available: false,
  state: "unavailable" as const,
  reason: "docket_submissions_table_not_established" as const,
  tableEstablished: false,
  canSubmit: false,
  canReview: false,
  message:
    "Docket submissions are unavailable because submission storage has not been established.",
};

function throwDocketComponentUnavailable(component: string): never {
  throw new TRPCError({
    code: "PRECONDITION_FAILED",
    message: `${component} is unavailable because its live storage has not been established.`,
  });
}

// ─── Router ───

export const docketRouter = router({
  /** List all docket entries with optional filters and search */
  list: publicProcedure
    .input(z.object({
      jurisdiction: z.string().optional(),
      jurisdictionLevel: z.enum(["federal", "state", "county", "city", "tribal"]).optional(),
      lawType: z.enum(["statute", "ordinance", "regulation", "executive_order", "ballot_measure", "proposed_bill", "constitutional_amendment"]).optional(),
      status: z.enum(["enacted", "proposed", "repealed", "amended", "under_review"]).optional(),
      search: z.string().optional(),
      limit: z.number().min(1).max(100).default(50),
      offset: z.number().min(0).default(0),
    }).optional())
    .query(async ({ input }) => {
      return list_live_docket_entries(input ?? {});
    }),

  /** Search actors by name across all docket entries */
  searchActors: publicProcedure
    .input(z.object({ term: z.string().min(1) }))
    .query(async () => []),

  /** Get a single docket entry by ID */
  getById: publicProcedure
    .input(z.object({ id: liveDocketEntryId }))
    .query(async ({ input }) => {
      const entry = await get_live_docket_entry(input.id);
      if (!entry) throw new TRPCError({ code: "NOT_FOUND", message: "Docket entry not found" });
      return entry;
    }),

  /** Get a single docket entry by slug */
  getBySlug: publicProcedure
    .input(z.object({ slug: z.string() }))
    .query(async ({ input }) => {
      const entry = await get_live_docket_entry_by_slug(input.slug);
      if (!entry) throw new TRPCError({ code: "NOT_FOUND", message: "Docket entry not found" });
      return entry;
    }),

  /** Get full analysis (entry + actors + impacts + sources) */
  getFullAnalysis: publicProcedure
    .input(z.object({ id: liveDocketEntryId }))
    .query(async ({ input }) => {
      const entry = await get_live_docket_entry(input.id);
      if (!entry) throw new TRPCError({ code: "NOT_FOUND", message: "Docket entry not found" });
      return {
        entry,
        actors: [],
        impacts: [],
        sources: [],
        componentAvailability: {
          actors: false,
          impacts: false,
          sources: false,
        },
      };
    }),

  /** Get docket statistics */
  stats: publicProcedure.query(async () => {
    return get_live_docket_stats();
  }),

  /** Create a new docket entry (admin only) */
  create: adminProcedure
    .input(docketEntryInput)
    .mutation(async ({ input }) => {
      const id = await create_live_docket_entry(input);
      return { id };
    }),

  /** Update a docket entry (admin only) */
  update: adminProcedure
    .input(z.object({ id: liveDocketEntryId }).merge(docketEntryInput.partial()))
    .mutation(async ({ input }) => {
      const { id, ...data } = input;
      const updated = await update_live_docket_entry(id, data);
      if (!updated) throw new TRPCError({ code: "NOT_FOUND" });
      return { success: true };
    }),

  /** Delete a docket entry from the live registry (admin only) */
  delete: adminProcedure
    .input(z.object({ id: liveDocketEntryId }))
    .mutation(async ({ input }) => {
      const deleted = await delete_live_docket_entry(input.id);
      if (!deleted) throw new TRPCError({ code: "NOT_FOUND" });
      return { success: true };
    }),

  /** Seed a complete docket analysis (admin only) — entry + actors + impacts + sources */
  seedFullAnalysis: adminProcedure
    .input(z.object({
      entry: docketEntryInput,
      actors: z.array(actorInput),
      impacts: z.array(impactInput),
      sources: z.array(sourceInput),
    }))
    .mutation(async () =>
      throwDocketComponentUnavailable("Full docket analysis seeding"),
    ),

  // ─── Actor sub-routes ───

  actors: router({
    list: publicProcedure
      .input(z.object({ docketId: liveDocketEntryId }))
      .query(async () => []),

    create: adminProcedure
      .input(z.object({ docketId: liveDocketEntryId }).merge(actorInput))
      .mutation(async () => throwDocketComponentUnavailable("Docket actors")),
  }),

  // ─── Impact sub-routes ───

  impacts: router({
    list: publicProcedure
      .input(z.object({ docketId: liveDocketEntryId }))
      .query(async () => []),

    create: adminProcedure
      .input(z.object({ docketId: liveDocketEntryId }).merge(impactInput))
      .mutation(async () => throwDocketComponentUnavailable("Docket impacts")),
  }),

  // ─── Source sub-routes ───

  sources: router({
    list: publicProcedure
      .input(z.object({ docketId: liveDocketEntryId }))
      .query(async () => []),

    create: adminProcedure
      .input(z.object({ docketId: liveDocketEntryId }).merge(sourceInput))
      .mutation(async () => throwDocketComponentUnavailable("Docket sources")),
  }),

  // ─── Submission sub-routes ───

  submissions: router({
    /** Explicit storage readiness for all submission UI surfaces. */
    availability: publicProcedure.query(
      async () => docketSubmissionAvailability,
    ),

    /** Submit a law for analysis (authenticated users) */
    create: protectedProcedure
      .input(z.object({
        lawTitle: z.string().min(1).max(512),
        jurisdiction: z.string().min(1).max(128),
        jurisdictionLevel: z.enum(["federal", "state", "county", "city", "tribal"]),
        referenceUrl: z.string().max(1024).optional(),
        fileUrl: z.string().max(1024).optional(),
        fileName: z.string().max(512).optional(),
        notes: z.string().max(2000).optional(),
      }))
      .mutation(async () =>
        throwDocketComponentUnavailable("Docket submissions"),
      ),

    /** List current user's submissions */
    mine: protectedProcedure
      .input(z.object({
        limit: z.number().min(1).max(50).default(20),
        offset: z.number().min(0).default(0),
      }).optional())
      .query(async () => []),

    /** List all submissions (admin only) */
    listAll: adminProcedure
      .input(z.object({
        status: z.enum(["pending", "in_review", "published", "rejected"]).optional(),
        limit: z.number().min(1).max(100).default(50),
        offset: z.number().min(0).default(0),
      }).optional())
      .query(async () => []),

    /** Update submission status (admin only) */
    updateStatus: adminProcedure
      .input(z.object({
        id: z.number(),
        status: z.enum(["pending", "in_review", "published", "rejected"]),
        adminNotes: z.string().optional(),
        docketEntryId: liveDocketEntryId.optional(),
      }))
      .mutation(async () =>
        throwDocketComponentUnavailable("Docket submissions"),
      ),
  }),

  /**
   * Seattle Legistar Live Feed
   * Fetches recent legislative matters from the Seattle Legistar Web API.
   * Public API — no key required. Returns recent matters filtered by keyword.
   */
  legistarFeed: publicProcedure
    .input(z.object({
      keyword: z.string().optional(),
      top: z.number().min(1).max(20).default(8),
    }).optional())
    .query(async ({ input }) => {
      const top = input?.top ?? 8;
      const keyword = input?.keyword?.trim();
      const baseUrl = "https://webapi.legistar.com/v1/seattle/matters";
      // Build OData filter
      let filterParts: string[] = [];
      if (keyword) {
        // substringof is case-insensitive in Legistar OData
        filterParts.push(`substringof('${encodeURIComponent(keyword)}',MatterTitle)`);
      }
      const filterStr = filterParts.length > 0 ? `&$filter=${filterParts.join(" and ")}` : "";
      const url = `${baseUrl}?$top=${top}&$orderby=MatterLastModifiedUtc+desc${filterStr}`;
      try {
        const res = await fetch(url, {
          headers: { "Accept": "application/json" },
          signal: AbortSignal.timeout(8000),
        });
        if (!res.ok) throw new Error(`Legistar API error: ${res.status}`);
        const data = await res.json() as unknown as any[];
        return {
          source: "Seattle Legistar",
          fetched_at: Date.now(),
          matters: data.map((m: any) => ({
            id: m.MatterId as number,
            file: m.MatterFile as string,
            title: m.MatterTitle as string,
            type: m.MatterTypeName as string,
            status: m.MatterStatusName as string,
            body: m.MatterBodyName as string,
            intro_date: m.MatterIntroDate as string | null,
            passed_date: m.MatterPassedDate as string | null,
            last_modified: m.MatterLastModifiedUtc as string,
            url: `https://seattle.legistar.com/LegislationDetail.aspx?ID=${m.MatterId}&GUID=${m.MatterGuid}`,
          })),
        };
      } catch (err: any) {
        // Graceful degradation — return empty feed with error note
        return {
          source: "Seattle Legistar",
          fetched_at: Date.now(),
          error: err.message || "Failed to fetch Legistar data",
          matters: [],
        };
      }
    }),

  /**
   * Seattle Legistar Events Feed
   * Returns upcoming/recent city council events for the Case Deadlines panel.
   */
  legistarEvents: publicProcedure
    .input(z.object({
      top: z.number().min(1).max(10).default(5),
    }).optional())
    .query(async ({ input }) => {
      const top = input?.top ?? 5;
      const url = `https://webapi.legistar.com/v1/seattle/events?$top=${top}&$orderby=EventDate+desc`;
      try {
        const res = await fetch(url, {
          headers: { "Accept": "application/json" },
          signal: AbortSignal.timeout(8000),
        });
        if (!res.ok) throw new Error(`Legistar Events API error: ${res.status}`);
        const data = await res.json() as unknown as any[];
        return {
          fetched_at: Date.now(),
          events: data.map((e: any) => ({
            id: e.EventId as number,
            body: e.EventBodyName as string,
            date: e.EventDate as string,
            location: e.EventLocation as string | null,
            agenda_url: e.EventAgendaFile as string | null,
          })),
        };
      } catch (err: any) {
        return {
          fetched_at: Date.now(),
          error: err.message || "Failed to fetch Legistar events",
          events: [],
        };
      }
    }),
});
