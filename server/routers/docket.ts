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
import * as docketDb from "../docket-db";
import { notifyOwner } from "../_core/notification";

// ─── Input Schemas ───

const docketEntryInput = z.object({
  slug: z.string().min(1).max(256),
  title: z.string().min(1).max(512),
  shortTitle: z.string().max(256).optional(),
  jurisdiction: z.string().min(1).max(128),
  jurisdictionLevel: z.enum(["federal", "state", "county", "city", "tribal"]),
  lawType: z.enum(["statute", "ordinance", "regulation", "executive_order", "ballot_measure", "proposed_bill", "constitutional_amendment"]),
  status: z.enum(["enacted", "proposed", "repealed", "amended", "under_review"]),
  dateIntroduced: z.string().optional(),
  dateEnacted: z.string().optional(),
  dateEffective: z.string().optional(),
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
      return docketDb.listDocketEntries(input);
    }),

  /** Search actors by name across all docket entries */
  searchActors: publicProcedure
    .input(z.object({ term: z.string().min(1) }))
    .query(async ({ input }) => {
      return docketDb.searchActorsByName(input.term);
    }),

  /** Get a single docket entry by ID */
  getById: publicProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const entry = await docketDb.getDocketEntry(input.id);
      if (!entry) throw new TRPCError({ code: "NOT_FOUND", message: "Docket entry not found" });
      return entry;
    }),

  /** Get a single docket entry by slug */
  getBySlug: publicProcedure
    .input(z.object({ slug: z.string() }))
    .query(async ({ input }) => {
      const entry = await docketDb.getDocketEntryBySlug(input.slug);
      if (!entry) throw new TRPCError({ code: "NOT_FOUND", message: "Docket entry not found" });
      return entry;
    }),

  /** Get full analysis (entry + actors + impacts + sources) */
  getFullAnalysis: publicProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const analysis = await docketDb.getFullDocketAnalysis(input.id);
      if (!analysis) throw new TRPCError({ code: "NOT_FOUND", message: "Docket entry not found" });
      return analysis;
    }),

  /** Get docket statistics */
  stats: publicProcedure.query(async () => {
    return docketDb.getDocketStats();
  }),

  /** Create a new docket entry (admin only) */
  create: adminProcedure
    .input(docketEntryInput)
    .mutation(async ({ input }) => {
      const now = Date.now();
      const id = await docketDb.createDocketEntry({
        ...input,
        createdAt: now,
        updatedAt: now,
      });
      return { id };
    }),

  /** Update a docket entry (admin only) */
  update: adminProcedure
    .input(z.object({ id: z.number() }).merge(docketEntryInput.partial()))
    .mutation(async ({ input }) => {
      const { id, ...data } = input;
      const existing = await docketDb.getDocketEntry(id);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND" });
      await docketDb.updateDocketEntry(id, data);
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
    .mutation(async ({ input }) => {
      const now = Date.now();

      // Check if slug already exists
      const existing = await docketDb.getDocketEntryBySlug(input.entry.slug);
      if (existing) {
        // Update existing entry
        await docketDb.updateDocketEntry(existing.id, input.entry);
        await docketDb.deleteActorsForDocket(existing.id);
        await docketDb.deleteImpactsForDocket(existing.id);
        await docketDb.deleteSourcesForDocket(existing.id);

        if (input.actors.length > 0) {
          await docketDb.bulkCreateActors(input.actors.map(a => ({ ...a, docketId: existing.id, createdAt: now })));
        }
        if (input.impacts.length > 0) {
          await docketDb.bulkCreateImpacts(input.impacts.map(i => ({ ...i, docketId: existing.id, createdAt: now })));
        }
        if (input.sources.length > 0) {
          await docketDb.bulkCreateSources(input.sources.map(s => ({ ...s, docketId: existing.id, createdAt: now })));
        }

        return { id: existing.id, updated: true };
      }

      // Create new entry
      const id = await docketDb.createDocketEntry({
        ...input.entry,
        createdAt: now,
        updatedAt: now,
      });

      if (input.actors.length > 0) {
        await docketDb.bulkCreateActors(input.actors.map(a => ({ ...a, docketId: id, createdAt: now })));
      }
      if (input.impacts.length > 0) {
        await docketDb.bulkCreateImpacts(input.impacts.map(i => ({ ...i, docketId: id, createdAt: now })));
      }
      if (input.sources.length > 0) {
        await docketDb.bulkCreateSources(input.sources.map(s => ({ ...s, docketId: id, createdAt: now })));
      }

      return { id, updated: false };
    }),

  // ─── Actor sub-routes ───

  actors: router({
    list: publicProcedure
      .input(z.object({ docketId: z.number() }))
      .query(async ({ input }) => {
        return docketDb.listActorsForDocket(input.docketId);
      }),

    create: adminProcedure
      .input(z.object({ docketId: z.number() }).merge(actorInput))
      .mutation(async ({ input }) => {
        const { docketId, ...data } = input;
        const id = await docketDb.createDocketActor({ ...data, docketId, createdAt: Date.now() });
        return { id };
      }),
  }),

  // ─── Impact sub-routes ───

  impacts: router({
    list: publicProcedure
      .input(z.object({ docketId: z.number() }))
      .query(async ({ input }) => {
        return docketDb.listImpactsForDocket(input.docketId);
      }),

    create: adminProcedure
      .input(z.object({ docketId: z.number() }).merge(impactInput))
      .mutation(async ({ input }) => {
        const { docketId, ...data } = input;
        const id = await docketDb.createDocketImpact({ ...data, docketId, createdAt: Date.now() });
        return { id };
      }),
  }),

  // ─── Source sub-routes ───

  sources: router({
    list: publicProcedure
      .input(z.object({ docketId: z.number() }))
      .query(async ({ input }) => {
        return docketDb.listSourcesForDocket(input.docketId);
      }),

    create: adminProcedure
      .input(z.object({ docketId: z.number() }).merge(sourceInput))
      .mutation(async ({ input }) => {
        const { docketId, ...data } = input;
        const id = await docketDb.createDocketSource({ ...data, docketId, createdAt: Date.now() });
        return { id };
      }),
  }),

  // ─── Submission sub-routes ───

  submissions: router({
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
      .mutation(async ({ ctx, input }) => {
        const now = Date.now();
        const id = await docketDb.createDocketSubmission({
          userId: ctx.user.id,
          userName: ctx.user.name ?? undefined,
          userEmail: ctx.user.email ?? undefined,
          lawTitle: input.lawTitle,
          jurisdiction: input.jurisdiction,
          jurisdictionLevel: input.jurisdictionLevel,
          referenceUrl: input.referenceUrl,
          fileUrl: input.fileUrl,
          fileName: input.fileName,
          notes: input.notes,
          status: "pending",
          createdAt: now,
          updatedAt: now,
        });

        // Notify owner of new submission
        const fileNote = input.fileName ? ` [Attached: ${input.fileName}]` : "";
        await notifyOwner({
          title: "New Docket Room Submission",
          content: `${ctx.user.name ?? "A user"} submitted "${input.lawTitle}" (${input.jurisdiction}, ${input.jurisdictionLevel}) for analysis.${fileNote}`,
        }).catch(() => {});

        return { id };
      }),

    /** List current user's submissions */
    mine: protectedProcedure
      .input(z.object({
        limit: z.number().min(1).max(50).default(20),
        offset: z.number().min(0).default(0),
      }).optional())
      .query(async ({ ctx, input }) => {
        return docketDb.listDocketSubmissions({
          userId: ctx.user.id,
          limit: input?.limit,
          offset: input?.offset,
        });
      }),

    /** List all submissions (admin only) */
    listAll: adminProcedure
      .input(z.object({
        status: z.enum(["pending", "in_review", "published", "rejected"]).optional(),
        limit: z.number().min(1).max(100).default(50),
        offset: z.number().min(0).default(0),
      }).optional())
      .query(async ({ input }) => {
        return docketDb.listDocketSubmissions(input);
      }),

    /** Update submission status (admin only) */
    updateStatus: adminProcedure
      .input(z.object({
        id: z.number(),
        status: z.enum(["pending", "in_review", "published", "rejected"]),
        adminNotes: z.string().optional(),
        docketEntryId: z.number().optional(),
      }))
      .mutation(async ({ input }) => {
        const existing = await docketDb.getDocketSubmission(input.id);
        if (!existing) throw new TRPCError({ code: "NOT_FOUND" });
        await docketDb.updateDocketSubmission(input.id, {
          status: input.status,
          adminNotes: input.adminNotes,
          docketEntryId: input.docketEntryId,
        });
        return { success: true };
      }),
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
        const data = await res.json() as any[];
        return {
          source: "Seattle Legistar",
          fetchedAt: Date.now(),
          matters: data.map((m: any) => ({
            id: m.MatterId as number,
            file: m.MatterFile as string,
            title: m.MatterTitle as string,
            type: m.MatterTypeName as string,
            status: m.MatterStatusName as string,
            body: m.MatterBodyName as string,
            introDate: m.MatterIntroDate as string | null,
            passedDate: m.MatterPassedDate as string | null,
            lastModified: m.MatterLastModifiedUtc as string,
            url: `https://seattle.legistar.com/LegislationDetail.aspx?ID=${m.MatterId}&GUID=${m.MatterGuid}`,
          })),
        };
      } catch (err: any) {
        // Graceful degradation — return empty feed with error note
        return {
          source: "Seattle Legistar",
          fetchedAt: Date.now(),
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
        const data = await res.json() as any[];
        return {
          fetchedAt: Date.now(),
          events: data.map((e: any) => ({
            id: e.EventId as number,
            body: e.EventBodyName as string,
            date: e.EventDate as string,
            location: e.EventLocation as string | null,
            agendaUrl: e.EventAgendaFile as string | null,
          })),
        };
      } catch (err: any) {
        return {
          fetchedAt: Date.now(),
          error: err.message || "Failed to fetch Legistar events",
          events: [],
        };
      }
    }),
});
