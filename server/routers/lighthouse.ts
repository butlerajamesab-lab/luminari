/**
 * Lighthouse — Community Hub tRPC Router
 *
 * Endpoints for:
 * - Suggestions (community ideas with voting)
 * - Spotlight (admin-curated rotating featured content)
 * - Job Board (vetted job postings, apprenticeships)
 * - Community Board (help wanted/offered, skill shares)
 */
import { z } from "zod";
import { router, publicProcedure, protectedProcedure, adminProcedure } from "../_core/trpc";
import * as db from "../db";
import { TRPCError } from "@trpc/server";
import { compileRegistry, validateCompiledRegistry, type CompilerInput } from "../registry-compiler";
import { validateRegistry as validateManifestRegistry, getRegisteredStates, getManifestStats, compareRegistries } from "../registry-manifest";
import { existsSync, readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __lh_dirname = dirname(fileURLToPath(import.meta.url));
const STATES_DIR = join(__lh_dirname, "..", "config", "states");
function loadStateFile<T>(stateCode: string, suffix: string): T | null {
  const fp = join(STATES_DIR, `${stateCode.toLowerCase()}_${suffix}.json`);
  if (!existsSync(fp)) return null;
  return JSON.parse(readFileSync(fp, "utf-8")) as T;
}
import { geocodeAddress, geocodeRegion, getStateCentroid, STATE_CENTROIDS, REGION_CENTROIDS } from "../geocoding";
import { buildMapLayers, clearMapCaches, invalidateGeocodeLookup, type MapLayersResponse } from "../civic-map";
import { buildMapIntakeContext, detectStateFromCoordinates, suggestPipelines, findNearbyResources, findNearbySignals, partitionResources } from "../map-intake";

/** Haversine distance in km between two lat/lng points */
function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371; // Earth radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ── Suggestions Router ───────────────────────────────────────────────

const suggestionsRouter = router({
  /** List suggestions (public — anyone can see accepted/implemented) */
  list: publicProcedure
    .input(z.object({
      status: z.enum(["pending", "reviewed", "accepted", "implemented", "declined"]).optional(),
      limit: z.number().min(1).max(100).default(50),
      offset: z.number().min(0).default(0),
    }).optional())
    .query(async ({ input }) => {
      return db.listSuggestions({
        status: input?.status,
        limit: input?.limit ?? 50,
        offset: input?.offset ?? 0,
      });
    }),

  /** Get which suggestions the current user has voted on */
  myVotes: protectedProcedure
    .query(async ({ ctx }) => {
      return db.getUserVotedSuggestionIds(ctx.user.id);
    }),

  /** Submit a new suggestion (authenticated users) */
  create: protectedProcedure
    .input(z.object({
      content: z.string().min(3).max(2000),
    }))
    .mutation(async ({ ctx, input }) => {
      const id = await db.createSuggestion(ctx.user.id, input.content);
      return { id };
    }),

  /** Vote for a suggestion */
  vote: protectedProcedure
    .input(z.object({ suggestionId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const success = await db.voteSuggestion(input.suggestionId, ctx.user.id);
      if (!success) {
        throw new TRPCError({ code: "CONFLICT", message: "You already voted for this suggestion" });
      }
      return { success: true };
    }),

  /** Remove vote from a suggestion */
  unvote: protectedProcedure
    .input(z.object({ suggestionId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const success = await db.unvoteSuggestion(input.suggestionId, ctx.user.id);
      return { success };
    }),

  /** Admin: update suggestion status */
  updateStatus: adminProcedure
    .input(z.object({
      id: z.number(),
      status: z.enum(["pending", "reviewed", "accepted", "implemented", "declined"]),
      adminNote: z.string().max(2000).optional(),
    }))
    .mutation(async ({ input }) => {
      await db.updateSuggestionStatus(input.id, input.status, input.adminNote);
      return { success: true };
    }),

  /** Admin: delete a suggestion */
  delete: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await db.deleteSuggestion(input.id);
      return { success: true };
    }),
});

// ── Spotlight Router ─────────────────────────────────────────────────

const spotlightRouter = router({
  /** List active spotlight items (public) */
  list: publicProcedure
    .input(z.object({ activeOnly: z.boolean().default(true) }).optional())
    .query(async ({ input }) => {
      return db.listSpotlightItems(input?.activeOnly ?? true);
    }),

  /** Admin: create a spotlight item */
  create: adminProcedure
    .input(z.object({
      eyebrow: z.string().min(1).max(64),
      title: z.string().min(1).max(256),
      description: z.string().min(1).max(5000),
      color: z.string().max(32).default("#d4a017"),
      cta: z.string().max(64).default("Learn More"),
      href: z.string().max(2000).optional(),
      active: z.boolean().default(true),
      sortOrder: z.number().default(0),
      startDate: z.number().optional(),
      endDate: z.number().optional(),
    }))
    .mutation(async ({ input }) => {
      const id = await db.createSpotlightItem(input);
      return { id };
    }),

  /** Admin: update a spotlight item */
  update: adminProcedure
    .input(z.object({
      id: z.number(),
      eyebrow: z.string().min(1).max(64).optional(),
      title: z.string().min(1).max(256).optional(),
      description: z.string().min(1).max(5000).optional(),
      color: z.string().max(32).optional(),
      cta: z.string().max(64).optional(),
      href: z.string().max(2000).nullable().optional(),
      active: z.boolean().optional(),
      sortOrder: z.number().optional(),
      startDate: z.number().nullable().optional(),
      endDate: z.number().nullable().optional(),
    }))
    .mutation(async ({ input }) => {
      const { id, ...data } = input;
      await db.updateSpotlightItem(id, data);
      return { success: true };
    }),

  /** Admin: delete a spotlight item */
  delete: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await db.deleteSpotlightItem(input.id);
      return { success: true };
    }),
});

// ── Jobs Router ──────────────────────────────────────────────────────

const jobsRouter = router({
  /** List jobs (public — shows active jobs) */
  list: publicProcedure
    .input(z.object({
      status: z.enum(["active", "filled", "expired", "draft"]).optional(),
      category: z.enum(["trades", "healthcare", "social_services", "legal", "education", "technology", "general"]).optional(),
      stateCode: z.string().max(2).optional(),
      jobType: z.enum(["full_time", "part_time", "apprenticeship", "internship", "training_program", "volunteer"]).optional(),
      limit: z.number().min(1).max(100).default(50),
      offset: z.number().min(0).default(0),
    }).optional())
    .query(async ({ input }) => {
      return db.listJobs({
        status: input?.status ?? "active",
        category: input?.category,
        stateCode: input?.stateCode,
        jobType: input?.jobType,
        limit: input?.limit ?? 50,
        offset: input?.offset ?? 0,
      });
    }),

  /** Get a single job by ID (public) */
  get: publicProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const job = await db.getJob(input.id);
      if (!job) throw new TRPCError({ code: "NOT_FOUND", message: "Job not found" });
      return job;
    }),

  /** Admin: create a job posting */
  create: adminProcedure
    .input(z.object({
      title: z.string().min(1).max(256),
      organization: z.string().min(1).max(256),
      description: z.string().min(1).max(10000),
      jobType: z.enum(["full_time", "part_time", "apprenticeship", "internship", "training_program", "volunteer"]),
      category: z.enum(["trades", "healthcare", "social_services", "legal", "education", "technology", "general"]).default("general"),
      location: z.string().max(256).optional(),
      stateCode: z.string().max(2).optional(),
      remote: z.boolean().default(false),
      url: z.string().max(2000).optional(),
      contactInfo: z.string().max(2000).optional(),
      requirements: z.string().max(5000).optional(),
      compensation: z.string().max(128).optional(),
      status: z.enum(["active", "filled", "expired", "draft"]).default("active"),
      expiresAt: z.number().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const id = await db.createJob({ ...input, postedBy: ctx.user.id });
      return { id };
    }),

  /** Admin: update a job posting */
  update: adminProcedure
    .input(z.object({
      id: z.number(),
      title: z.string().min(1).max(256).optional(),
      organization: z.string().min(1).max(256).optional(),
      description: z.string().min(1).max(10000).optional(),
      jobType: z.enum(["full_time", "part_time", "apprenticeship", "internship", "training_program", "volunteer"]).optional(),
      category: z.enum(["trades", "healthcare", "social_services", "legal", "education", "technology", "general"]).optional(),
      location: z.string().max(256).nullable().optional(),
      stateCode: z.string().max(2).nullable().optional(),
      remote: z.boolean().optional(),
      url: z.string().max(2000).nullable().optional(),
      contactInfo: z.string().max(2000).nullable().optional(),
      requirements: z.string().max(5000).nullable().optional(),
      compensation: z.string().max(128).nullable().optional(),
      status: z.enum(["active", "filled", "expired", "draft"]).optional(),
      expiresAt: z.number().nullable().optional(),
    }))
    .mutation(async ({ input }) => {
      const { id, ...data } = input;
      await db.updateJob(id, data);
      return { success: true };
    }),

  /** Admin: delete a job posting */
  delete: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await db.deleteJob(input.id);
      return { success: true };
    }),
});

// ── Community Board Router ───────────────────────────────────────────

const postsRouter = router({
  /** List community posts (public — shows active posts) */
  list: publicProcedure
    .input(z.object({
      category: z.enum(["ask_help", "offer_help", "skill_share", "resource_share", "general"]).optional(),
      stateCode: z.string().max(2).optional(),
      status: z.enum(["active", "resolved", "expired", "flagged", "removed"]).optional(),
      limit: z.number().min(1).max(100).default(50),
      offset: z.number().min(0).default(0),
    }).optional())
    .query(async ({ input }) => {
      return db.listPosts({
        category: input?.category,
        stateCode: input?.stateCode,
        status: input?.status ?? "active",
        limit: input?.limit ?? 50,
        offset: input?.offset ?? 0,
      });
    }),

  /** Get a single post with author name (public) */
  get: publicProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const post = await db.getPostWithAuthor(input.id);
      if (!post) throw new TRPCError({ code: "NOT_FOUND", message: "Post not found" });
      return post;
    }),

  /** Create a community post (authenticated users) */
  create: protectedProcedure
    .input(z.object({
      category: z.enum(["ask_help", "offer_help", "skill_share", "resource_share", "general"]),
      title: z.string().min(1).max(256),
      content: z.string().min(1).max(5000),
      stateCode: z.string().max(2).optional(),
      location: z.string().max(256).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const id = await db.createPost({ ...input, userId: ctx.user.id });
      return { id };
    }),

  /** Update own post (or admin can update any) */
  update: protectedProcedure
    .input(z.object({
      id: z.number(),
      title: z.string().min(1).max(256).optional(),
      content: z.string().min(1).max(5000).optional(),
      category: z.enum(["ask_help", "offer_help", "skill_share", "resource_share", "general"]).optional(),
      stateCode: z.string().max(2).nullable().optional(),
      location: z.string().max(256).nullable().optional(),
      status: z.enum(["active", "resolved", "expired", "flagged", "removed"]).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const post = await db.getPost(input.id);
      if (!post) throw new TRPCError({ code: "NOT_FOUND", message: "Post not found" });
      // Only the author or an admin can edit
      if (post.userId !== ctx.user.id && ctx.user.role !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "You can only edit your own posts" });
      }
      const { id, ...data } = input;
      await db.updatePost(id, data);
      return { success: true };
    }),

  /** Delete own post (or admin can delete any) */
  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const post = await db.getPost(input.id);
      if (!post) throw new TRPCError({ code: "NOT_FOUND", message: "Post not found" });
      if (post.userId !== ctx.user.id && ctx.user.role !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "You can only delete your own posts" });
      }
      await db.deletePost(input.id);
      return { success: true };
    }),

  /** Admin: flag/remove a post */
  moderate: adminProcedure
    .input(z.object({
      id: z.number(),
      status: z.enum(["flagged", "removed", "active"]),
    }))
    .mutation(async ({ input }) => {
      await db.updatePost(input.id, { status: input.status });
      return { success: true };
    }),
});

// ── Registry Compiler Router ────────────────────────────────────────

const registryRouter = router({
  /** Get list of all registered states */
  states: publicProcedure.query(async () => {
    return getRegisteredStates();
  }),
  /** Get a state's full profile: layer0 flags, manifest, help contacts, oversight */
  stateProfile: publicProcedure
    .input(z.object({ stateCode: z.string().min(2).max(2) }))
    .query(async ({ input }) => {
      const sc = input.stateCode.toUpperCase();
      const manifest = loadStateFile<any>(sc, "manifest");
      const layer0 = loadStateFile<any>(sc, "layer0_flags");
      const help = loadStateFile<any>(sc, "help");
      const oversight = loadStateFile<any>(sc, "oversight");
      const programs = loadStateFile<any>(sc, "programs");
      const tribal = loadStateFile<any>(sc, "tribal_overrides");
      const workflows = loadStateFile<any>(sc, "workflow_overrides");
      if (!manifest) throw new TRPCError({ code: "NOT_FOUND", message: `State ${sc} not found in registry` });
      return {
        stateCode: sc,
        stateName: manifest.state_name || sc,
        manifest,
        layer0Flags: layer0?.flags || [],
        helpContacts: help?.routing_index || help?.contacts || [],
        oversightBodies: oversight?.oversight_chains || oversight?.chains || [],
        programCount: programs?.programs?.length || 0,
        tribalOverrides: tribal || null,
        workflowCount: workflows?.workflows?.length || 0,
      };
    }),

  /** Get aggregate stats across all states */
  stats: publicProcedure.query(async () => {
    return getManifestStats();
  }),

  /** Compare registries across all states */
  compare: publicProcedure.query(async () => {
    return compareRegistries();
  }),

  /** Validate a specific state's registry */
  validate: publicProcedure
    .input(z.object({ stateCode: z.string().length(2) }))
    .query(async ({ input }) => {
      const manifestResult = validateManifestRegistry(input.stateCode.toUpperCase());
      const compilerResult = validateCompiledRegistry(input.stateCode.toUpperCase());
      return { manifest: manifestResult, layers: compilerResult };
    }),

  /** Admin: compile a new state registry from research document */
  compile: adminProcedure
    .input(z.object({
      document: z.string().min(100).max(200000),
      stateCode: z.string().length(2),
      stateName: z.string().min(2).max(64),
      source: z.string().max(256).optional(),
    }))
    .mutation(async ({ input }) => {
      const compilerInput: CompilerInput = {
        document: input.document,
        stateCode: input.stateCode.toUpperCase(),
        stateName: input.stateName,
        source: input.source,
      };
      return compileRegistry(compilerInput);
    }),
});

// ── Events Router ─────────────────────────────────────────────────────

const eventsRouter = router({
  /** List events (public) */
  list: publicProcedure
    .input(z.object({
      status: z.enum(["upcoming", "active", "completed", "cancelled"]).optional(),
      stateCode: z.string().max(2).optional(),
      eventType: z.enum(["workshop", "training", "community_meeting", "legal_clinic", "resource_fair", "tribal_gathering", "other"]).optional(),
      limit: z.number().min(1).max(100).default(50),
      offset: z.number().min(0).default(0),
    }).optional())
    .query(async ({ input }) => {
      return db.listEvents_lh({
        status: input?.status,
        stateCode: input?.stateCode,
        eventType: input?.eventType,
        limit: input?.limit ?? 50,
        offset: input?.offset ?? 0,
      });
    }),

  /** Get a single event (public) */
  get: publicProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const event = await db.getEvent_lh(input.id);
      if (!event) throw new TRPCError({ code: "NOT_FOUND", message: "Event not found" });
      return event;
    }),

  /** Admin: create an event */
  create: adminProcedure
    .input(z.object({
      title: z.string().min(1).max(256),
      description: z.string().min(1).max(5000),
      eventType: z.enum(["workshop", "training", "community_meeting", "legal_clinic", "resource_fair", "tribal_gathering", "other"]).default("workshop"),
      organization: z.string().max(256).optional(),
      stateCode: z.string().max(2).optional(),
      location: z.string().max(256).optional(),
      url: z.string().max(2000).optional(),
      contactInfo: z.string().max(2000).optional(),
      startsAt: z.number(),
      endsAt: z.number().optional(),
      recurring: z.boolean().default(false),
      status: z.enum(["upcoming", "active", "completed", "cancelled"]).default("upcoming"),
    }))
    .mutation(async ({ ctx, input }) => {
      // Auto-geocode location if provided
      let lat: number | undefined;
      let lng: number | undefined;
      if (input.location) {
        const geo = await geocodeAddress(input.location);
        if (geo) { lat = geo.lat; lng = geo.lng; }
      }
      const id = await db.createEvent_lh({ ...input, lat, lng, postedBy: ctx.user.id });
      return { id };
    }),

  /** Admin: update an event */
  update: adminProcedure
    .input(z.object({
      id: z.number(),
      title: z.string().min(1).max(256).optional(),
      description: z.string().min(1).max(5000).optional(),
      eventType: z.enum(["workshop", "training", "community_meeting", "legal_clinic", "resource_fair", "tribal_gathering", "other"]).optional(),
      organization: z.string().max(256).nullable().optional(),
      stateCode: z.string().max(2).nullable().optional(),
      location: z.string().max(256).nullable().optional(),
      url: z.string().max(2000).nullable().optional(),
      contactInfo: z.string().max(2000).nullable().optional(),
      startsAt: z.number().optional(),
      endsAt: z.number().nullable().optional(),
      recurring: z.boolean().optional(),
      status: z.enum(["upcoming", "active", "completed", "cancelled"]).optional(),
    }))
    .mutation(async ({ input }) => {
      const { id, ...data } = input;
      // Re-geocode if location changed
      if (data.location && data.location !== null) {
        const geo = await geocodeAddress(data.location);
        if (geo) { (data as any).lat = geo.lat; (data as any).lng = geo.lng; }
      }
      await db.updateEvent_lh(id, data);
      return { success: true };
    }),

  /** Admin: delete an event */
  delete: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await db.deleteEvent_lh(input.id);
      return { success: true };
    }),
});

// ── Civic Map Router ───────────────────────────────────────────────────

const mapRouter = router({
  /**
   * lighthouse.map.layers — the primary aggregation endpoint.
   * Returns structured arrays for: resources, jobs, posts, workshops, tribal_events, pattern_signals.
   * All items include lat/lng when available.
   */
  layers: publicProcedure
    .input(z.object({
      stateCode: z.string().max(2).optional(),
      /** Only include pattern signals from the last N days (default 90) */
      signalWindowDays: z.number().min(1).max(365).default(90),
    }).optional())
    .query(async ({ input }) => {
      return buildMapLayers({
        stateCode: input?.stateCode,
        signalWindowDays: input?.signalWindowDays ?? 90,
      });
    }),

  /**
   * lighthouse.map.nearby — location-based discovery.
   * Returns resources, jobs, events, posts within a radius of a given lat/lng.
   */
  nearby: publicProcedure
    .input(z.object({
      lat: z.number().min(-90).max(90),
      lng: z.number().min(-180).max(180),
      radiusKm: z.number().min(1).max(500).default(50),
    }))
    .query(async ({ input }) => {
      const { lat, lng, radiusKm } = input;

      // Registry resources: filter by haversine distance in-memory
      const allLayers = await buildMapLayers({ signalWindowDays: 90 });
      const nearbyResources = allLayers.resources.filter(r => {
        const d = haversineDistance(lat, lng, r.lat, r.lng);
        return d <= radiusKm;
      });

      // DB items: use SQL haversine
      const [jobs, posts, events] = await Promise.all([
        db.getNearbyJobs(lat, lng, radiusKm),
        db.getNearbyPosts(lat, lng, radiusKm),
        db.getNearbyEvents(lat, lng, radiusKm),
      ]);

      // Pattern signals: filter from all layers
      const nearbySignals = allLayers.pattern_signals.filter(s => {
        const d = haversineDistance(lat, lng, s.lat, s.lng);
        return d <= radiusKm;
      });

      return {
        resources: nearbyResources,
        jobs: jobs.map(j => ({ type: "job" as const, ...j })),
        posts: posts.map(p => ({ type: "post" as const, ...p })),
        events: events.map(e => ({ type: "event" as const, ...e })),
        pattern_signals: nearbySignals,
        meta: {
          center: { lat, lng },
          radiusKm,
          total: nearbyResources.length + jobs.length + posts.length + events.length + nearbySignals.length,
        },
      };
    }),

  /**
   * lighthouse.map.search — search resources by name, category, city, or state.
   * Returns matching items with their coordinates for zoom-to-pin.
   */
  search: publicProcedure
    .input(z.object({
      query: z.string().min(1).max(200),
      limit: z.number().min(1).max(100).default(25),
    }))
    .query(async ({ input }) => {
      const q = input.query.toLowerCase();
      const allLayers = await buildMapLayers({ signalWindowDays: 90 });

      // Search registry resources
      const matchedResources = allLayers.resources.filter(r => {
        return (
          r.name.toLowerCase().includes(q) ||
          (r.category ?? "").toLowerCase().includes(q) ||
          r.stateCode.toLowerCase().includes(q) ||
          r.region.toLowerCase().includes(q) ||
          (r.agency ?? "").toLowerCase().includes(q) ||
          (r.services ?? []).some(s => s.toLowerCase().includes(q))
        );
      }).slice(0, input.limit);

      // Search jobs
      const matchedJobs = allLayers.jobs.filter(j => {
        return (
          j.title.toLowerCase().includes(q) ||
          j.organization.toLowerCase().includes(q) ||
          (j.category ?? "").toLowerCase().includes(q) ||
          (j.location ?? "").toLowerCase().includes(q) ||
          (j.stateCode ?? "").toLowerCase().includes(q)
        );
      }).slice(0, input.limit);

      // Search events
      const matchedEvents = [...allLayers.workshops, ...allLayers.tribal_events].filter(e => {
        return (
          e.title.toLowerCase().includes(q) ||
          (e.organization ?? "").toLowerCase().includes(q) ||
          (e.location ?? "").toLowerCase().includes(q) ||
          (e.stateCode ?? "").toLowerCase().includes(q)
        );
      }).slice(0, input.limit);

      // Search posts
      const matchedPosts = allLayers.posts.filter(p => {
        return (
          p.title.toLowerCase().includes(q) ||
          (p.category ?? "").toLowerCase().includes(q) ||
          (p.location ?? "").toLowerCase().includes(q) ||
          (p.stateCode ?? "").toLowerCase().includes(q)
        );
      }).slice(0, input.limit);

      // Compute bounding box for zoom
      const allItems = [
        ...matchedResources.map(r => ({ lat: r.lat, lng: r.lng })),
        ...matchedJobs.filter(j => j.lat && j.lng).map(j => ({ lat: j.lat!, lng: j.lng! })),
        ...matchedEvents.filter(e => e.lat && e.lng).map(e => ({ lat: e.lat!, lng: e.lng! })),
        ...matchedPosts.filter(p => p.lat && p.lng).map(p => ({ lat: p.lat!, lng: p.lng! })),
      ];

      let bounds = null;
      if (allItems.length > 0) {
        bounds = {
          north: Math.max(...allItems.map(i => i.lat)),
          south: Math.min(...allItems.map(i => i.lat)),
          east: Math.max(...allItems.map(i => i.lng)),
          west: Math.min(...allItems.map(i => i.lng)),
        };
      }

      return {
        resources: matchedResources,
        jobs: matchedJobs,
        events: matchedEvents,
        posts: matchedPosts,
        bounds,
        total: matchedResources.length + matchedJobs.length + matchedEvents.length + matchedPosts.length,
      };
    }),

  /** Geocode a single address (admin utility) */
  geocode: adminProcedure
    .input(z.object({ address: z.string().min(3).max(512) }))
    .mutation(async ({ input }) => {
      const result = await geocodeAddress(input.address);
      if (!result) throw new TRPCError({ code: "NOT_FOUND", message: "Could not geocode address" });
      return result;
    }),

  /** Batch geocode all registry resources that have street addresses (admin utility) */
  batchGeocodeRegistry: adminProcedure
    .input(z.object({
      stateCode: z.string().length(2).optional(),
      dryRun: z.boolean().default(false),
    }))
    .mutation(async ({ input }) => {
      const { readdirSync, readFileSync } = await import("fs");
      const { join } = await import("path");
      const statesDir = join(process.cwd(), "server/config/states");

      // Determine which states to process
      let stateCodes: string[];
      if (input.stateCode) {
        stateCodes = [input.stateCode.toUpperCase()];
      } else {
        const files = readdirSync(statesDir).filter((f: string) => f.endsWith("_manifest.json"));
        stateCodes = files.map((f: string) => f.replace("_manifest.json", "").toUpperCase());
      }

      const results = {
        total: 0,
        geocoded: 0,
        cached: 0,
        failed: 0,
        skipped: 0,
        details: [] as Array<{ org: string; state: string; address: string; status: string; lat?: number; lng?: number }>,
      };

      for (const sc of stateCodes) {
        const scl = sc.toLowerCase();
        // Collect all entries with street addresses
        const entries: Array<{ name: string; address: string; city: string; state: string; zip: string }> = [];

        // Programs
        try {
          const progData = JSON.parse(readFileSync(join(statesDir, `${scl}_programs.json`), "utf-8"));
          for (const p of (progData.programs ?? [])) {
            if (p.street_address && p.city) {
              entries.push({ name: p.program_name ?? p.name ?? "?", address: p.street_address, city: p.city, state: p.state_code ?? sc, zip: p.zip ?? "" });
            }
          }
        } catch {}

        // Oversight
        try {
          const ovData = JSON.parse(readFileSync(join(statesDir, `${scl}_oversight.json`), "utf-8"));
          for (const chain of (ovData.oversight_chains ?? [])) {
            for (const b of (chain.bodies ?? [])) {
              if (b.street_address && b.city) {
                entries.push({ name: b.oversight_body ?? b.name ?? "?", address: b.street_address, city: b.city, state: b.state_code ?? sc, zip: b.zip ?? "" });
              }
            }
          }
        } catch {}

        // Tribal
        try {
          const tribalData = JSON.parse(readFileSync(join(statesDir, `${scl}_tribal_overrides.json`), "utf-8"));
          for (const e of (tribalData.tribal_entities ?? [])) {
            if (e.street_address && e.city) {
              entries.push({ name: e.tribal_entity_name ?? e.name ?? "?", address: e.street_address, city: e.city, state: e.state_code ?? sc, zip: e.zip ?? "" });
            }
          }
          for (const u of (tribalData.urban_indian_programs ?? [])) {
            if (u.street_address && u.city) {
              entries.push({ name: u.name ?? "?", address: u.street_address, city: u.city, state: u.state_code ?? sc, zip: u.zip ?? "" });
            }
          }
        } catch {}

        // Geocode each entry
        for (const entry of entries) {
          results.total++;
          const fullAddress = `${entry.address}, ${entry.city}, ${entry.state} ${entry.zip}`.trim();

          if (input.dryRun) {
            results.details.push({ org: entry.name, state: sc, address: fullAddress, status: "dry_run" });
            results.skipped++;
            continue;
          }

          try {
            const result = await geocodeAddress(fullAddress);
            if (result) {
              const status = result.source === "cache" ? "cached" : "geocoded";
              if (status === "cached") results.cached++;
              else results.geocoded++;
              results.details.push({ org: entry.name, state: sc, address: fullAddress, status, lat: result.lat, lng: result.lng });
            } else {
              results.failed++;
              results.details.push({ org: entry.name, state: sc, address: fullAddress, status: "failed" });
            }
          } catch (err) {
            results.failed++;
            results.details.push({ org: entry.name, state: sc, address: fullAddress, status: "error" });
          }
        }
      }

      // Clear map caches and geocode lookup so next request picks up new geocoded data
      clearMapCaches();
      invalidateGeocodeLookup();

      return results;
    }),
});

// ── Map-Based Intake Router ─────────────────────────────────────────────

const mapIntakeRouter = router({
  /**
   * lighthouse.mapIntake.initFromMap — Initialize an intake session from a map click.
   * T1. Receives coordinates from map pin click
   * T2-T6. Builds geographic context, discovers nearby resources, suggests pipelines
   * T7. Creates a persistent session
   */
  initFromMap: protectedProcedure
    .input(z.object({
      lat: z.number().min(-90).max(90),
      lng: z.number().min(-180).max(180),
      radiusKm: z.number().min(1).max(500).default(50),
    }))
    .mutation(async ({ ctx, input }) => {
      const context = await buildMapIntakeContext(input.lat, input.lng, input.radiusKm);

      // Persist the session
      const { id, createdAt } = await db.createMapIntakeSession({
        userId: ctx.user.id,
        lat: input.lat,
        lng: input.lng,
        detectedState: context.detectedState ?? undefined,
        detectedRegion: context.detectedRegion ?? undefined,
        nearbyResources: context.nearbyResources,
        patternSignals: context.patternSignals,
        suggestedPipelines: context.suggestedPipelines,
        nearestPrograms: context.nearestPrograms,
        nearestOversight: context.nearestOversight,
        radiusKm: input.radiusKm,
      });

      return {
        sessionId: id,
        ...context,
        createdAt,
      };
    }),

  /**
   * lighthouse.mapIntake.getSession — Retrieve an existing intake session.
   */
  getSession: protectedProcedure
    .input(z.object({ sessionId: z.number() }))
    .query(async ({ ctx, input }) => {
      const session = await db.getMapIntakeSession(input.sessionId, ctx.user.id);
      if (!session) throw new TRPCError({ code: "NOT_FOUND", message: "Session not found" });
      return session;
    }),

  /**
   * lighthouse.mapIntake.listSessions — List active intake sessions for the current user.
   */
  listSessions: protectedProcedure
    .query(async ({ ctx }) => {
      return db.listActiveMapIntakeSessions(ctx.user.id);
    }),

  /**
   * lighthouse.mapIntake.completeSession — Mark a session as completed and link to a case.
   */
  completeSession: protectedProcedure
    .input(z.object({
      sessionId: z.number(),
      caseId: z.number(),
    }))
    .mutation(async ({ ctx, input }) => {
      const session = await db.getMapIntakeSession(input.sessionId, ctx.user.id);
      if (!session) throw new TRPCError({ code: "NOT_FOUND", message: "Session not found" });
      if (session.status !== "active") throw new TRPCError({ code: "BAD_REQUEST", message: "Session is not active" });
      await db.completeMapIntakeSession(input.sessionId, ctx.user.id, input.caseId);
      return { success: true };
    }),

  /**
   * lighthouse.mapIntake.suggestPipelines — Re-run pipeline suggestions with updated context.
   * Useful when the user adjusts the radius or provides additional context.
   */
  suggestPipelines: publicProcedure
    .input(z.object({
      lat: z.number().min(-90).max(90),
      lng: z.number().min(-180).max(180),
      radiusKm: z.number().min(1).max(500).default(50),
    }))
    .query(async ({ input }) => {
      const detectedState = detectStateFromCoordinates(input.lat, input.lng);
      const nearbyResources = await findNearbyResources(input.lat, input.lng, input.radiusKm, detectedState ?? undefined);
      const nearbySignals = await findNearbySignals(input.lat, input.lng, input.radiusKm);
      const suggestions = suggestPipelines(nearbyResources, nearbySignals, detectedState);
      return {
        detectedState,
        suggestions,
        resourceCount: nearbyResources.length,
        signalCount: nearbySignals.length,
      };
    }),
});

// ── Combined Lighthouse Router ───────────────────────────────────────────

export const lighthouseRouter = router({
  suggestions: suggestionsRouter,
  spotlight: spotlightRouter,
  jobs: jobsRouter,
  posts: postsRouter,
  events: eventsRouter,
  registry: registryRouter,
  map: mapRouter,
  mapIntake: mapIntakeRouter,
});