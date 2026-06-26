/**
 * Governance Router — Constitutional Enforcement API
 * 
 * Exposes:
 * - Public feed (redacted governance log entries)
 * - Chain verification endpoint (anyone can verify integrity)
 * - Deep audit (full entry details, admin only)
 * - Snapshot creation (admin only)
 * - Governed operations (threshold updates, signal suppression, etc.)
 */

import { z } from "zod";
import { router, publicProcedure, protectedProcedure, adminProcedure } from "../_core/trpc";
import { db } from "../db";
import { desc, sql, and, eq, lt } from "drizzle-orm";
import { governanceLog, governanceSnapshots, GOVERNANCE_EVENT_TYPES } from "../../drizzle/schema";
import {
  verifyGovernanceChain,
  getGovernanceLogPublicFeed,
  getGovernanceLogEntry,
  createGovernanceSnapshot,
  getLatestGovernanceSnapshot,
  exportGovernanceLog,
} from "../governance-log";
import {
  governedThresholdUpdate,
  governedDataStreamToggle,
  governedSignalSuppression,
  governedEngineToggle,
  governedEngineConfigChange,
  governedCategoryReclassification,
  governedVersionChange,
} from "../governance-hooks";

export const governanceRouter = router({
  // ═══════════════════════════════════════════════════════════════════
  // PUBLIC ENDPOINTS (Anyone can verify system integrity)
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Public feed — redacted governance log entries.
   * Shows what changed, when, and why — without raw state data.
   */
  publicFeed: publicProcedure
    .input(z.object({
      limit: z.number().min(1).max(100).default(50),
      offset: z.number().min(0).default(0),
    }).optional())
    .query(async ({ input }) => {
      const { limit = 50, offset = 0 } = input ?? {};
      return getGovernanceLogPublicFeed(db, limit, offset);
    }),

  /**
   * Chain verification — anyone can verify the hash chain integrity.
   * Returns: valid (boolean), total entries, last valid seq_no, break point (if any).
   */
  verifyChain: publicProcedure.query(async () => {
    return verifyGovernanceChain(db);
  }),

  /**
   * Latest snapshot — public verification of the latest signed snapshot.
   */
  latestSnapshot: publicProcedure.query(async () => {
    return getLatestGovernanceSnapshot(db);
  }),

  /**
   * Public recent entries — last N entries with safe field projection.
   * No auth required. Shows structural metadata only (no raw state data).
   */
  publicRecentEntries: publicProcedure
    .input(z.object({
      limit: z.number().min(1).max(100).default(25),
      cursor: z.number().optional(),
    }).optional())
    .query(async ({ input }) => {
      const { limit = 25, cursor } = input ?? {};
      const conditions: any[] = [];
      if (cursor) conditions.push(lt(governanceLog.seqNo, cursor));
      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

      const entries = await db
        .select({
          seqNo: governanceLog.seqNo,
          eventType: governanceLog.eventType,
          component: governanceLog.component,
          scope: governanceLog.scope,
          entryHash: governanceLog.entryHash,
          previousHash: governanceLog.previousHash,
          createdAt: governanceLog.createdAt,
        })
        .from(governanceLog)
        .where(whereClause)
        .orderBy(desc(governanceLog.seqNo))
        .limit(limit + 1);

      const hasMore = entries.length > limit;
      const items = hasMore ? entries.slice(0, limit) : entries;
      const nextCursor = hasMore ? items[items.length - 1].seqNo : undefined;

      return { items, hasMore, nextCursor };
    }),

  /**
   * Public entry detail — full structural metadata for a single entry.
   * No auth required. Returns verification-relevant fields only.
   */
  publicEntryDetail: publicProcedure
    .input(z.object({ seqNo: z.number() }))
    .query(async ({ input }) => {
      const [entry] = await db
        .select({
          seqNo: governanceLog.seqNo,
          eventType: governanceLog.eventType,
          component: governanceLog.component,
          scope: governanceLog.scope,
          entryHash: governanceLog.entryHash,
          previousHash: governanceLog.previousHash,
          createdAt: governanceLog.createdAt,
          actorHash: governanceLog.actorHash,
          actorRole: governanceLog.actorRole,
          rationale: governanceLog.rationale,
        })
        .from(governanceLog)
        .where(eq(governanceLog.seqNo, input.seqNo));
      return entry ?? null;
    }),

  /**
   * Public export — full governance log as JSONL (safe field projection).
   * No auth required. Returns JSONL string ordered by seq_no ASC.
   */
  publicExportLog: publicProcedure.query(async () => {
    const entries = await db
      .select({
        seqNo: governanceLog.seqNo,
        eventType: governanceLog.eventType,
        component: governanceLog.component,
        scope: governanceLog.scope,
        previousState: governanceLog.previousState,
        newState: governanceLog.newState,
        rationale: governanceLog.rationale,
        actorHash: governanceLog.actorHash,
        actorRole: governanceLog.actorRole,
        previousHash: governanceLog.previousHash,
        entryHash: governanceLog.entryHash,
        createdAt: governanceLog.createdAt,
      })
      .from(governanceLog)
      .orderBy(governanceLog.seqNo);

    // Normalize JSON fields and produce JSONL
    const lines = entries.map(e => {
      const normalizeJson = (val: any) => {
        if (val === null || val === undefined) return null;
        if (typeof val === "string") {
          try { return JSON.parse(val); } catch { return val; }
        }
        return val;
      };
      return JSON.stringify({
        seq_no: e.seqNo,
        event_type: e.eventType,
        component: e.component,
        scope: e.scope,
        previous_state: normalizeJson(e.previousState),
        new_state: normalizeJson(e.newState),
        rationale: e.rationale,
        actor_hash: e.actorHash,
        actor_role: e.actorRole,
        previous_hash: e.previousHash,
        entry_hash: e.entryHash,
        created_at: e.createdAt,
      });
    });
    return lines.join("\n");
  }),

  // ═══════════════════════════════════════════════════════════════════
  // DASHBOARD ENDPOINTS (Governance Dashboard UI)
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Dashboard feed — cursor-paginated governance log with filters.
   * Uses seq_no DESC for deterministic ordering.
   * Filters: eventType, componentType, scopeType, scopeId
   */
  dashboardFeed: adminProcedure
    .input(z.object({
      limit: z.number().min(1).max(100).default(50),
      cursor: z.number().optional(), // seq_no to paginate from (exclusive)
      eventType: z.string().optional(),
      componentType: z.string().optional(),
      scopeType: z.string().optional(),
      scopeId: z.string().optional(),
    }))
    .query(async ({ input }) => {
      const { limit, cursor, eventType, componentType, scopeType, scopeId } = input;

      // Build conditions array
      const conditions: any[] = [];
      if (cursor) {
        conditions.push(lt(governanceLog.seqNo, cursor));
      }
      if (eventType && eventType.length > 0) {
        conditions.push(eq(governanceLog.eventType, eventType));
      }
      if (componentType && componentType.length > 0) {
        conditions.push(eq(governanceLog.component, componentType));
      }
      if (scopeType && scopeType.length > 0) {
        // scope field format: "scopeType:scopeId" or just "scopeType"
        if (scopeId && scopeId.length > 0) {
          conditions.push(sql`${governanceLog.scope} LIKE ${`${scopeType}:${scopeId}%`}`);
        } else {
          conditions.push(sql`${governanceLog.scope} LIKE ${`${scopeType}%`}`);
        }
      }

      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

      const entries = await db
        .select({
          seqNo: governanceLog.seqNo,
          eventType: governanceLog.eventType,
          component: governanceLog.component,
          scope: governanceLog.scope,
          rationale: governanceLog.rationale,
          actorRole: governanceLog.actorRole,
          actorHash: governanceLog.actorHash,
          entryHash: governanceLog.entryHash,
          previousHash: governanceLog.previousHash,
          createdAt: governanceLog.createdAt,
        })
        .from(governanceLog)
        .where(whereClause)
        .orderBy(desc(governanceLog.seqNo))
        .limit(limit + 1); // fetch one extra to detect if there's more

      const hasMore = entries.length > limit;
      const items = hasMore ? entries.slice(0, limit) : entries;
      const nextCursor = hasMore ? items[items.length - 1].seqNo : undefined;

      // Get total count (with same filters, no cursor)
      const countConditions: any[] = [];
      if (eventType && eventType.length > 0) countConditions.push(eq(governanceLog.eventType, eventType));
      if (componentType && componentType.length > 0) countConditions.push(eq(governanceLog.component, componentType));
      if (scopeType && scopeType.length > 0) {
        if (scopeId && scopeId.length > 0) {
          countConditions.push(sql`${governanceLog.scope} LIKE ${`${scopeType}:${scopeId}%`}`);
        } else {
          countConditions.push(sql`${governanceLog.scope} LIKE ${`${scopeType}%`}`);
        }
      }
      const countWhere = countConditions.length > 0 ? and(...countConditions) : undefined;
      const [countResult] = await db
        .select({ count: sql<number>`COUNT(*)` })
        .from(governanceLog)
        .where(countWhere);

      return {
        items,
        total: countResult.count,
        nextCursor,
        hasMore,
      };
    }),

  /**
   * Dashboard entry detail — full metadata with normalized JSON.
   * Normalizes previousState and newState if stored as strings.
   */
  dashboardEntry: adminProcedure
    .input(z.object({ seqNo: z.number() }))
    .query(async ({ input }) => {
      const [entry] = await db
        .select()
        .from(governanceLog)
        .where(eq(governanceLog.seqNo, input.seqNo));

      if (!entry) return null;

      // Normalize JSON fields — parse if string, keep if object
      const normalizeJson = (val: any) => {
        if (val === null || val === undefined) return null;
        if (typeof val === "string") {
          try { return JSON.parse(val); } catch { return val; }
        }
        return val;
      };

      return {
        ...entry,
        previous_state: normalizeJson(entry.previousState),
        new_state: normalizeJson(entry.newState),
      };
    }),

  /**
   * Dashboard chain status — real verification with cached result.
   */
  dashboardChainStatus: adminProcedure.query(async () => {
    const verification = await verifyGovernanceChain(db);
    const [countResult] = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(governanceLog);
    const [latestEntry] = await db
      .select({ seqNo: governanceLog.seqNo, createdAt: governanceLog.createdAt })
      .from(governanceLog)
      .orderBy(desc(governanceLog.seqNo))
      .limit(1);

    return {
      ...verification,
      total_entries: countResult.count,
      last_entry_at: latestEntry?.createdAt ?? null,
      last_seq_no: latestEntry?.seqNo ?? 0,
    };
  }),

  /**
   * Dashboard verify chain — trigger full re-verification.
   */
  dashboardVerifyChain: adminProcedure.mutation(async () => {
    return verifyGovernanceChain(db);
  }),

  /**
   * Dashboard snapshots — list all snapshots.
   */
  dashboardSnapshots: adminProcedure.query(async () => {
    const snapshots = await db
      .select()
      .from(governanceSnapshots)
      .orderBy(desc(governanceSnapshots.createdAt));
    return snapshots;
  }),

  /**
   * Dashboard event types — return all valid event types for filter dropdown.
   */
  dashboardEventTypes: adminProcedure.query(async () => {
    return [...GOVERNANCE_EVENT_TYPES];
  }),

  /**
   * Dashboard distinct components — for filter dropdown.
   */
  dashboardComponents: adminProcedure.query(async () => {
    const results = await db
      .selectDistinct({ component: governanceLog.component })
      .from(governanceLog)
      .orderBy(governanceLog.component);
    return results.map(r => r.component);
  }),

  // ═══════════════════════════════════════════════════════════════════
  // ADMIN ENDPOINTS (Deep audit + governed operations)
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Deep audit — full entry details including before/after state.
   */
  getEntry: adminProcedure
    .input(z.object({ seqNo: z.number() }))
    .query(async ({ input }) => {
      return getGovernanceLogEntry(db, input.seqNo);
    }),

  /**
   * Create a cryptographic snapshot of the governance log.
   */
  createSnapshot: adminProcedure
    .input(z.object({ upToSeqNo: z.number().optional() }).optional())
    .mutation(async ({ input }) => {
      return createGovernanceSnapshot(db, input?.upToSeqNo);
    }),

  /**
   * Export the full governance log as JSONL for external verification.
   */
  exportLog: adminProcedure.query(async () => {
    return exportGovernanceLog(db);
  }),

  // ═══════════════════════════════════════════════════════════════════
  // GOVERNED OPERATIONS (All writes go through governance hooks)
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Update a threshold value (Sunam, escalation, pattern, etc.)
   */
  updateThreshold: adminProcedure
    .input(z.object({
      tableName: z.enum([
        "sunam_thresholds",
        "escalation_thresholds",
        "pattern_creation_thresholds",
        "pattern_decay_rules",
        "pattern_confidence_factors",
      ]),
      recordId: z.number(),
      changes: z.record(z.string(), z.unknown()),
      rationale: z.string().min(10),
    }))
    .mutation(async ({ input, ctx }) => {
      return governedThresholdUpdate({
        tableName: input.tableName,
        recordId: input.recordId,
        changes: input.changes,
        rationale: input.rationale,
        actorId: ctx.user.open_id,
        actorRole: "admin",
      });
    }),

  /**
   * Toggle a data stream (enable/disable).
   */
  toggleDataStream: adminProcedure
    .input(z.object({
      datasetId: z.string(),
      enabled: z.boolean(),
      rationale: z.string().min(10),
    }))
    .mutation(async ({ input, ctx }) => {
      return governedDataStreamToggle({
        datasetId: input.datasetId,
        enabled: input.enabled,
        rationale: input.rationale,
        actorId: ctx.user.open_id,
        actorRole: "admin",
      });
    }),

  /**
   * Suppress or restore a signal.
   */
  toggleSignalSuppression: adminProcedure
    .input(z.object({
      signalId: z.number(),
      suppress: z.boolean(),
      rationale: z.string().min(10),
    }))
    .mutation(async ({ input, ctx }) => {
      return governedSignalSuppression({
        signalId: input.signalId,
        suppress: input.suppress,
        rationale: input.rationale,
        actorId: ctx.user.open_id,
        actorRole: "admin",
      });
    }),

  /**
   * Toggle an engine (enable/disable).
   */
  toggleEngine: adminProcedure
    .input(z.object({
      engineId: z.string(),
      engineName: z.string(),
      enabled: z.boolean(),
      config: z.record(z.string(), z.unknown()).optional(),
      rationale: z.string().min(10),
    }))
    .mutation(async ({ input, ctx }) => {
      return governedEngineToggle({
        engineId: input.engineId,
        engineName: input.engineName,
        enabled: input.enabled,
        config: input.config,
        rationale: input.rationale,
        actorId: ctx.user.open_id,
        actorRole: "admin",
      });
    }),

  /**
   * Change engine configuration.
   */
  updateEngineConfig: adminProcedure
    .input(z.object({
      engineId: z.string(),
      engineName: z.string(),
      previousConfig: z.record(z.string(), z.unknown()),
      newConfig: z.record(z.string(), z.unknown()),
      rationale: z.string().min(10),
    }))
    .mutation(async ({ input, ctx }) => {
      return governedEngineConfigChange({
        engineId: input.engineId,
        engineName: input.engineName,
        previousConfig: input.previousConfig,
        newConfig: input.newConfig,
        rationale: input.rationale,
        actorId: ctx.user.open_id,
        actorRole: "admin",
      });
    }),

  /**
   * Reclassify a gap, signal, or pattern category.
   */
  reclassifyCategory: adminProcedure
    .input(z.object({
      targetType: z.enum(["gap", "signal", "pattern"]),
      targetId: z.string(),
      previousCategory: z.string(),
      newCategory: z.string(),
      rationale: z.string().min(10),
    }))
    .mutation(async ({ input, ctx }) => {
      return governedCategoryReclassification({
        targetType: input.targetType,
        targetId: input.targetId,
        previousCategory: input.previousCategory,
        newCategory: input.newCategory,
        rationale: input.rationale,
        actorId: ctx.user.open_id,
        actorRole: "admin",
      });
    }),

  /**
   * Record a version change (Gap Standard, Constitution, Signal Taxonomy).
   */
  recordVersionChange: adminProcedure
    .input(z.object({
      versionType: z.enum(["gap_standard", "constitution", "signal_taxonomy"]),
      previousVersion: z.string(),
      newVersion: z.string(),
      changelog: z.string(),
      rationale: z.string().min(10),
    }))
    .mutation(async ({ input, ctx }) => {
      return governedVersionChange({
        versionType: input.versionType,
        previousVersion: input.previousVersion,
        newVersion: input.newVersion,
        changelog: input.changelog,
        rationale: input.rationale,
        actorId: ctx.user.open_id,
        actorRole: "admin",
      });
    }),
});
