/**
 * LUMINARI — UNIFIED OUTPUT LAYER
 * src/server/routers/unifiedOutput.ts
 *
 * tRPC router. Fetches from all source tables, passes rows to projection
 * functions, returns UnifiedNode[]. This is the only file with DB access.
 *
 * Add to src/server/routers/index.ts:
 *   import { unifiedOutputRouter } from "./unifiedOutput";
 *   unifiedOutput: unifiedOutputRouter,
 */

import { z } from "zod";
import { router, protectedProcedure } from "../trpc"; // adjust import path to match your setup
import { db } from "../../db";
import {
  getUnifiedNodes,
  filterForCivicMap,
  filterForFilingGenerator,
  filterForDeadlineTracker,
  filterForEvidence,
} from "../../lib/unified-output-layer";
import type { UnifiedNodeType, UrgencyLevel } from "../../types/unifiedNode";

// ─── Input Schemas ────────────────────────────────────────────────────────────

const NodeTypeSchema = z.enum([
  "mh_resource", "signal", "deadline", "filing",
  "template", "benefit", "program", "gap",
  "enforcement_pathway", "pattern",
]);

const UrgencySchema = z.enum([
  "critical", "high", "medium", "low", "informational",
]);

const CivicMapFilterSchema = z.object({
  jurisdiction: z.string().optional(),
  state: z.string().optional(),
  types: z.array(NodeTypeSchema).optional(),
  urgency: z.array(UrgencySchema).optional(),
  pipelines: z.array(z.string()).optional(),
  boundingBox: z.object({
    north: z.number(),
    south: z.number(),
    east: z.number(),
    west: z.number(),
  }).optional(),
  caseId: z.string().optional(),
  limit: z.number().min(1).max(500).default(200),
});

// ─── DB Fetch Helpers ─────────────────────────────────────────────────────────
// Each fetch is isolated — failure in one source does not block others.

async function fetchMHResources(jurisdiction?: string) {
  try {
    // Adjust table name to match your Drizzle schema
    const query = db
      .selectFrom("mental_health_resources")
      .selectAll();

    if (jurisdiction) {
      return await query
        .where("state", "=", jurisdiction)
        .limit(500)
        .execute();
    }

    return await query.limit(1000).execute();
  } catch {
    return [];
  }
}

async function fetchSignals(jurisdiction?: string) {
  try {
    const query = db
      .selectFrom("enriched_signals_staging")
      .selectAll()
      .where("active", "=", true);

    if (jurisdiction) {
      return await query
        .where((eb) =>
          eb.or([
            eb("state", "=", jurisdiction),
            eb("jurisdiction", "=", jurisdiction),
            eb("jurisdiction", "=", "federal"),
          ])
        )
        .orderBy("created_at", "desc")
        .limit(300)
        .execute();
    }

    return await query
      .orderBy("created_at", "desc")
      .limit(300)
      .execute();
  } catch {
    return [];
  }
}

async function fetchDeadlines(caseId?: string) {
  try {
    const query = db
      .selectFrom("foia_requests")
      .selectAll()
      .where("status", "not in", ["complete", "closed", "withdrawn"]);

    if (caseId) {
      return await query
        .where("case_id", "=", Number(caseId))
        .execute();
    }

    return await query
      .orderBy("deadline_date", "asc")
      .limit(200)
      .execute();
  } catch {
    return [];
  }
}

async function fetchTemplates(pipelineType?: string) {
  try {
    const query = db
      .selectFrom("filing_templates") // adjust to your actual table name
      .selectAll()
      .where("is_active", "=", true);

    if (pipelineType) {
      return await query
        .where("pipeline_type", "=", pipelineType)
        .execute();
    }

    return await query.limit(200).execute();
  } catch {
    return [];
  }
}

async function fetchBenefits(state?: string) {
  try {
    const query = db
      .selectFrom("programs") // 1,701 programs in registry
      .selectAll()
      .where("is_active", "=", true);

    if (state) {
      return await query
        .where((eb) =>
          eb.or([
            eb("state", "=", state),
            eb("jurisdiction", "=", "federal"),
            eb("jurisdiction", "=", "national"),
          ])
        )
        .limit(300)
        .execute();
    }

    return await query.limit(500).execute();
  } catch {
    return [];
  }
}

// ─── Router ───────────────────────────────────────────────────────────────────

export const unifiedOutputRouter = router({

  /**
   * Primary feed — all nodes for Civic Map.
   * Accepts full CivicMapFilter. Returns filtered, sorted UnifiedNode[].
   */
  getCivicMapNodes: protectedProcedure
    .input(CivicMapFilterSchema)
    .query(async ({ input }) => {
      const [mhResources, signals, deadlines, templates, benefits] = await Promise.allSettled([
        fetchMHResources(input.state ?? input.jurisdiction),
        fetchSignals(input.state ?? input.jurisdiction),
        fetchDeadlines(input.caseId),
        fetchTemplates(),
        fetchBenefits(input.state),
      ]);

      const result = getUnifiedNodes({
        mhResources: mhResources.status === "fulfilled" ? mhResources.value as any[] : [],
        signals: signals.status === "fulfilled" ? signals.value as any[] : [],
        deadlines: deadlines.status === "fulfilled" ? deadlines.value as any[] : [],
        templates: templates.status === "fulfilled" ? templates.value as any[] : [],
        benefits: benefits.status === "fulfilled" ? benefits.value as any[] : [],
      });

      const filtered = filterForCivicMap(result.nodes, {
        jurisdiction: input.jurisdiction,
        state: input.state,
        types: input.types as UnifiedNodeType[] | undefined,
        urgency: input.urgency as UrgencyLevel[] | undefined,
        boundingBox: input.boundingBox,
      });

      return {
        nodes: filtered.slice(0, input.limit),
        meta: {
          ...result.meta,
          filtered: filtered.length,
          returned: Math.min(filtered.length, input.limit),
        },
      };
    }),

  /**
   * Filing Generator feed — templates + deadlines only.
   * Used by Filing Generator and Legal Library sections.
   */
  getFilingNodes: protectedProcedure
    .input(z.object({
      caseId: z.string().optional(),
      pipelineType: z.string().optional(),
      jurisdiction: z.string().optional(),
    }))
    .query(async ({ input }) => {
      const [deadlines, templates] = await Promise.allSettled([
        fetchDeadlines(input.caseId),
        fetchTemplates(input.pipelineType),
      ]);

      const result = getUnifiedNodes({
        deadlines: deadlines.status === "fulfilled" ? deadlines.value as any[] : [],
        templates: templates.status === "fulfilled" ? templates.value as any[] : [],
      });

      return {
        nodes: filterForFilingGenerator(result.nodes),
        meta: result.meta,
      };
    }),

  /**
   * Deadline Tracker feed — FOIA deadlines sorted by urgency.
   * Used by FOIA Tracker section.
   */
  getDeadlineNodes: protectedProcedure
    .input(z.object({
      caseId: z.string().optional(),
      urgency: z.array(UrgencySchema).optional(),
    }))
    .query(async ({ input }) => {
      const deadlines = await fetchDeadlines(input.caseId);

      const result = getUnifiedNodes({
        deadlines: deadlines as any[],
      });

      let nodes = filterForDeadlineTracker(result.nodes);

      if (input.urgency?.length) {
        nodes = nodes.filter((n) => (input.urgency as UrgencyLevel[]).includes(n.urgency));
      }

      return { nodes, meta: result.meta };
    }),

  /**
   * Evidence Surface feed — signals + MH resources for case context.
   * Used by analysis pipeline case view, structural diagnostics.
   */
  getEvidenceNodes: protectedProcedure
    .input(z.object({
      jurisdiction: z.string().optional(),
      state: z.string().optional(),
      caseId: z.string().optional(),
      policyEventIds: z.array(z.string()).optional(),
    }))
    .query(async ({ input }) => {
      const [mhResources, signals] = await Promise.allSettled([
        fetchMHResources(input.state ?? input.jurisdiction),
        fetchSignals(input.state ?? input.jurisdiction),
      ]);

      const result = getUnifiedNodes({
        mhResources: mhResources.status === "fulfilled" ? mhResources.value as any[] : [],
        signals: signals.status === "fulfilled" ? signals.value as any[] : [],
      });

      let nodes = filterForEvidence(result.nodes);

      // Filter by policy event if requested (e.g. show signals related to PE-009)
      if (input.policyEventIds?.length) {
        nodes = nodes.filter((n) =>
          n.policyEventIds.some((id) => input.policyEventIds!.includes(id))
        );
      }

      return { nodes, meta: result.meta };
    }),

  /**
   * Meta endpoint — stream health + counts per source.
   * Used by Mission Control widget.
   */
  getStreamMeta: protectedProcedure
    .query(async () => {
      const [mhCount, signalCount, deadlineCount, templateCount, benefitCount] = await Promise.allSettled([
        db.selectFrom("mental_health_resources").select(db.fn.countAll().as("count")).executeTakeFirst(),
        db.selectFrom("enriched_signals_staging").select(db.fn.countAll().as("count")).where("active", "=", true).executeTakeFirst(),
        db.selectFrom("foia_requests").select(db.fn.countAll().as("count")).where("status", "not in", ["complete", "closed"]).executeTakeFirst(),
        db.selectFrom("filing_templates").select(db.fn.countAll().as("count")).where("is_active", "=", true).executeTakeFirst(),
        db.selectFrom("programs").select(db.fn.countAll().as("count")).where("is_active", "=", true).executeTakeFirst(),
      ]);

      return {
        sources: {
          mh_registry: {
            count: Number((mhCount.status === "fulfilled" ? mhCount.value?.count : null) ?? 0),
            status: mhCount.status,
          },
          enriched_signals: {
            count: Number((signalCount.status === "fulfilled" ? signalCount.value?.count : null) ?? 0),
            status: signalCount.status,
          },
          foia_tracker: {
            count: Number((deadlineCount.status === "fulfilled" ? deadlineCount.value?.count : null) ?? 0),
            status: deadlineCount.status,
          },
          templates: {
            count: Number((templateCount.status === "fulfilled" ? templateCount.value?.count : null) ?? 0),
            status: templateCount.status,
          },
          programs: {
            count: Number((benefitCount.status === "fulfilled" ? benefitCount.value?.count : null) ?? 0),
            status: benefitCount.status,
          },
        },
        generatedAt: new Date().toISOString(),
      };
    }),
});
