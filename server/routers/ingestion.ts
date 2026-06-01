/**
 * Ingestion Pipeline Router
 * 
 * tRPC procedures for dataset registry management, manual ingestion triggers,
 * run history, and live signal queries.
 */

import { z } from "zod";
import { router, protectedProcedure, adminProcedure, publicProcedure } from "../_core/trpc";
import { db } from "../db";
import { dataStreamRegistry, ingestRuns, ingestedRecords, liveSignals, detectedSignals } from "../../drizzle/schema";
import { eq, desc, and, sql, count, gte } from "drizzle-orm";
import { triggerManualIngestion, getSchedulerStatus, refreshSchedules, isDatasetRunning, isDatasetQueued } from "../ingestion/scheduler";
import { WA_CONSUMER_COMPLAINTS, WA_IMAGED_DOCUMENTS } from "../ingestion/socrata-adapter";
import { populateAtlasPublicStreams, summarizeAtlasCatalog } from "../ingestion/atlas-population-engine";
import { classifyEntity, batchClassifyEntities, shouldGenerateSignal } from "../ingestion/entity-classifier";
import { findMergeCandidates, applyMerge, backfillEntityClassifications } from "../ingestion/entity-deduplicator";
import { entityAliases } from "../../drizzle/schema";
import { governedDataStreamCreate, governedDataStreamToggle, governedDataStreamDelete } from "../governance-hooks";

const SYSTEM_ACTOR = "SYSTEM:ingestion-pipeline";

export const ingestionRouter = router({
  // ─── Dataset Registry ───

  listDatasets: publicProcedure.query(async () => {
    const rows = await db.select().from(dataStreamRegistry).orderBy(desc(dataStreamRegistry.createdAt));
    return rows.map((r: typeof dataStreamRegistry.$inferSelect) => ({
      datasetId: r.streamId,
      datasetName: r.streamName,
      enabled: r.enabled,
      updateFrequency: r.updateFrequency,
      jurisdiction: r.jurisdiction ?? "",
      domain: r.domain ?? "",
      totalRecordsIngested: r.recordsIngested ?? 0,
      lastIngestedAt: r.lastIngestedAt ?? null,
      lastRunStatus: r.lastRunStatus ?? null,
      consecutiveFailures: r.consecutiveFailures ?? 0,
      signalsGenerated: r.signalsGenerated ?? 0,
      source: r.source ?? "",
      apiUrl: r.apiUrl ?? "",
      description: r.description ?? "",
    }));
  }),

  getDataset: protectedProcedure
    .input(z.object({ datasetId: z.string() }))
    .query(async ({ input }) => {
      const [dataset] = await db
        .select()
        .from(dataStreamRegistry)
        .where(eq(dataStreamRegistry.streamId, input.datasetId))
        .limit(1);
      return dataset ?? null;
    }),

  registerDataset: adminProcedure
    .input(z.object({
      datasetId: z.string(),
      datasetName: z.string(),
      source: z.string(),
      apiUrl: z.string(),
      updateFrequency: z.enum(["hourly", "daily", "weekly", "monthly", "manual"]).default("daily"),
      jurisdiction: z.string(),
      domain: z.string(),
      description: z.string().optional(),
      fieldMapping: z.record(z.string(), z.string()).optional(),
      cronExpression: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      // GOVERNED: Data stream creation
      await governedDataStreamCreate({
        streamData: {
          streamId: input.datasetId,
          streamName: input.datasetName,
          streamType: 'public_records',
          source: input.source,
          sourceUrl: input.apiUrl,
          apiUrl: input.apiUrl,
          updateFrequency: input.updateFrequency,
          jurisdiction: input.jurisdiction,
          domain: input.domain,
          description: input.description ?? null,
          fieldMapping: input.fieldMapping ?? null,
          cronExpression: input.cronExpression ?? null,
        },
        rationale: `New data stream registered: ${input.datasetName} (${input.source}, ${input.jurisdiction}/${input.domain})`,
        actorId: ctx.user?.openId ?? SYSTEM_ACTOR,
        actorRole: "admin",
      });

      // Refresh scheduler to pick up new dataset
      await refreshSchedules();

      return { success: true, datasetId: input.datasetId };
    }),

  toggleDataset: adminProcedure
    .input(z.object({
      datasetId: z.string(),
      enabled: z.boolean(),
      rationale: z.string().min(10).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      // GOVERNED: Data stream enable/disable
      await governedDataStreamToggle({
        datasetId: input.datasetId,
        enabled: input.enabled,
        rationale: input.rationale ?? `Data stream ${input.enabled ? "enabled" : "disabled"} via admin control panel`,
        actorId: ctx.user.openId,
        actorRole: "admin",
      });
      await refreshSchedules();
      return { success: true };
    }),

  deleteDataset: adminProcedure
    .input(z.object({
      datasetId: z.string(),
      rationale: z.string().min(10).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      // GOVERNED: Data stream deletion
      await governedDataStreamDelete({
        datasetId: input.datasetId,
        rationale: input.rationale ?? `Data stream removed via admin control panel`,
        actorId: ctx.user.openId,
        actorRole: "admin",
      });
      await refreshSchedules();
      return { success: true };
    }),

  // ─── Atlas Population Engine ───

  get_atlas_public_stream_catalog: publicProcedure.query(() => summarizeAtlasCatalog()),

  seed_atlas_population_streams: adminProcedure
    .input(z.object({
      stream_ids: z.array(z.string()).optional(),
    }).optional())
    .mutation(async ({ ctx, input }) => {
      const result = await populateAtlasPublicStreams({
        streamIds: input?.stream_ids,
        actorId: ctx.user?.openId ?? SYSTEM_ACTOR,
        actorRole: "admin",
      });

      await refreshSchedules();
      return result;
    }),

  // ─── Seed Preconfigured Datasets ───

  seedDefaultDatasets: adminProcedure.mutation(async () => {
    const now = Date.now();
    const datasets = [
      {
        ...WA_CONSUMER_COMPLAINTS,
        datasetName: "WA Attorney General Consumer Complaints",
        source: "socrata",
        updateFrequency: "daily" as const,
        jurisdiction: "Washington",
        domain: "consumer_protection",
        description: "Consumer complaints filed with the Washington State Attorney General's Office. Contains business categories, geographic data, status, and savings amounts.",
      },
      {
        ...WA_IMAGED_DOCUMENTS,
        datasetName: "WA Public Disclosure Commission Documents",
        source: "socrata",
        updateFrequency: "daily" as const,
        jurisdiction: "Washington",
        domain: "campaign_finance",
        description: "Campaign finance filings and reports from the Washington State Public Disclosure Commission. Contains filer names, offices, parties, legislative districts, and document types.",
      },
    ];

    let seeded = 0;
    for (const ds of datasets) {
      // Check if already exists
      const [existing] = await db
        .select({ id: dataStreamRegistry.id })
        .from(dataStreamRegistry)
        .where(eq(dataStreamRegistry.streamId, ds.datasetId))
        .limit(1);

      if (!existing) {
        // GOVERNED: Data stream creation via seed
        await governedDataStreamCreate({
          streamData: {
            streamId: ds.datasetId,
            streamName: ds.datasetName,
            streamType: ds.domain === 'consumer_protection' ? 'government_complaints' : 'public_records',
            source: ds.source,
            sourceUrl: ds.apiUrl,
            apiUrl: ds.apiUrl,
            updateFrequency: ds.updateFrequency,
            jurisdiction: ds.jurisdiction,
            domain: ds.domain,
            description: ds.description,
            fieldMapping: ds.fieldMapping,
          },
          rationale: `Seeding preconfigured data stream: ${ds.datasetName} — standard system initialization`,
          actorId: SYSTEM_ACTOR,
          actorRole: "system",
        });
        seeded++;
      }
    }

    await refreshSchedules();
    return { seeded, total: datasets.length };
  }),

  // ─── Manual Ingestion Trigger ───

  triggerIngestion: adminProcedure
    .input(z.object({
      datasetId: z.string(),
      maxRecords: z.number().optional(),
    }))
    .mutation(async ({ input }) => {
      // Run in background, return immediately
      const resultPromise = triggerManualIngestion(input.datasetId, input.maxRecords);
      
      // Wait for result (with timeout)
      const result = await Promise.race([
        resultPromise,
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 120_000)), // 2 min timeout
      ]);

      if (!result) {
        return { success: true, message: "Ingestion started (running in background)", status: "running" };
      }

      return {
        // @ts-expect-error pre-existing type mismatch
        success: result.success,
        message: result.success
          ? `Processed ${result.recordsProcessed} records, ${result.signalsGenerated} signals generated`
          : `Failed: ${result.errors.join(", ")}`,
        status: result.success ? "completed" : "failed",
        ...result,
      };
    }),

  // ─── Ingest Run History ───

  listRuns: publicProcedure
    .input(z.object({
      datasetId: z.string().optional(),
      limit: z.number().default(20),
    }))
    .query(async ({ input }) => {
      const conditions = input.datasetId
        ? eq(ingestRuns.datasetId, input.datasetId)
        : undefined;

      return db
        .select()
        .from(ingestRuns)
        .where(conditions)
        .orderBy(desc(ingestRuns.startTime))
        .limit(input.limit);
    }),

  getRunDetails: protectedProcedure
    .input(z.object({ runId: z.number() }))
    .query(async ({ input }) => {
      const [run] = await db
        .select()
        .from(ingestRuns)
        .where(eq(ingestRuns.id, input.runId))
        .limit(1);
      return run ?? null;
    }),

  // ─── Live Signals ───

  listLiveSignals: publicProcedure
    .input(z.object({
      datasetId: z.string().optional(),
      jurisdiction: z.string().optional(),
      severity: z.enum(["critical", "high", "medium", "low"]).optional(),
      activeOnly: z.boolean().default(true),
      limit: z.number().default(50),
    }))
    .query(async ({ input }) => {
      // CANONICAL: Read from detected_signals (single source of truth)
      const conditions: string[] = [];
      if (input.datasetId) conditions.push(`dataset_id = '${input.datasetId}'`);
      if (input.jurisdiction) conditions.push(`jurisdiction_scope = '${input.jurisdiction}'`);
      if (input.severity) conditions.push(`severity_level = '${input.severity}'`);
      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
      const rows = await db.execute(
        sql.raw(`SELECT signal_id, signal_type, dataset_id, jurisdiction_scope, severity_level,
                        plain_language_explanation, confidence_score, extraction_timestamp,
                        escalation_status, affected_entities, entity_id
                 FROM detected_signals ${whereClause}
                 ORDER BY extraction_timestamp DESC LIMIT ${input.limit}`)
      );
      return ((rows as any)[0] || []).map((r: any) => ({
        id: r.signal_id,
        signalType: r.signal_type,
        datasetId: r.dataset_id,
        jurisdiction: r.jurisdiction_scope,
        severity: r.severity_level,
        title: r.signal_type,
        explanation: r.plain_language_explanation,
        confidenceScore: r.confidence_score,
        detectedAt: r.extraction_timestamp ? Number(r.extraction_timestamp) : null,
        active: true,
        escalationTier: r.escalation_status,
        entityId: r.entity_id,
        affectedEntities: r.affected_entities,
      }));
    }),

  getLiveSignalStats: publicProcedure.query(async () => {
    // CANONICAL: Read from detected_signals (single source of truth)
    const totalRows = await db.execute(sql.raw(`SELECT COUNT(*) as cnt FROM detected_signals`));
    const totalActive = (totalRows as any)[0][0]?.cnt ?? 0;

    const sevRows = await db.execute(sql.raw(
      `SELECT severity_level as severity, COUNT(*) as cnt FROM detected_signals GROUP BY severity_level`
    ));
    const bySeverity = Object.fromEntries(
      ((sevRows as any)[0] || []).map((r: any) => [r.severity, Number(r.cnt)])
    );

    const dsRows = await db.execute(sql.raw(
      `SELECT dataset_id as datasetId, COUNT(*) as cnt FROM detected_signals GROUP BY dataset_id`
    ));
    const byDataset = Object.fromEntries(
      ((dsRows as any)[0] || []).map((r: any) => [r.datasetId, Number(r.cnt)])
    );

    return { totalActive: Number(totalActive), bySeverity, byDataset };
  }),

  // ─── Ingested Records Stats ───

  getRecordStats: protectedProcedure
    .input(z.object({ datasetId: z.string() }))
    .query(async ({ input }) => {
      const [totalResult] = await db
        .select({ count: count() })
        .from(ingestedRecords)
        .where(eq(ingestedRecords.datasetId, input.datasetId));

      const byCategory = await db
        .select({
          category: ingestedRecords.normalizedCategory,
          count: count(),
        })
        .from(ingestedRecords)
        .where(eq(ingestedRecords.datasetId, input.datasetId))
        .groupBy(ingestedRecords.normalizedCategory)
        .orderBy(desc(count()))
        .limit(20);

      const byCity = await db
        .select({
          city: ingestedRecords.normalizedCity,
          count: count(),
        })
        .from(ingestedRecords)
        .where(eq(ingestedRecords.datasetId, input.datasetId))
        .groupBy(ingestedRecords.normalizedCity)
        .orderBy(desc(count()))
        .limit(20);

      return {
        totalRecords: totalResult?.count ?? 0,
        topCategories: byCategory.filter(r => r.category),
        topCities: byCity.filter(r => r.city),
      };
    }),

  // ─── Dataset Run Status (for UI button state) ───

  datasetRunStatus: publicProcedure
    .input(z.object({ datasetId: z.string() }))
    .query(({ input }) => {
      return {
        running: isDatasetRunning(input.datasetId),
        queued: isDatasetQueued(input.datasetId),
      };
    }),

  // ─── Scheduler Status ───

  getSchedulerStatus: publicProcedure.query(async () => {
    return getSchedulerStatus();
  }),

  // ─── Entity Classification (Session 65) ───

  classifyEntity: protectedProcedure
    .input(z.object({ entityName: z.string() }))
    .query(({ input }) => {
      return classifyEntity(input.entityName);
    }),

  /** Backfill entity classifications for existing repeat_entity signals */
  backfillEntityClassifications: adminProcedure.mutation(async () => {
    return backfillEntityClassifications();
  }),

  /**
   * Session 67+70: Comprehensive signal backfill.
   * T1. Reclassify all repeat_entity signals through entity role filter.
   * T2. Suppress non-responsible entities (political candidates, complainants, attorneys).
   * T3. Remove non-entity placeholder names ("Unknown", "Private Individual", etc.).
   * T4. Update frequency_spike signal titles from "Elevated Volume" to "Sector Spike".
   * T5. Add entity type/role metadata to all classified signals.
   */
  backfillSignalRoles: adminProcedure.mutation(async () => {
    // Non-entity placeholder names that should be suppressed
    const NON_ENTITY_NAMES = new Set([
      "private individual", "unknown", "unnamed business", "unknown - imposter scam",
      "n/a", "na", "none", "not applicable", "unspecified", "other", "various",
      "multiple", "anonymous", "confidential", "redacted", "test", "self",
      "individual", "consumer", "complainant",
    ]);

    // T1. Get all active repeat_entity signals
    const entitySignals = await db
      .select()
      .from(liveSignals)
      .where(and(
        eq(liveSignals.active, true),
        sql`${liveSignals.signalType} = 'repeat_entity'`
      ));

    let reclassified = 0;
    let suppressed = 0;
    let updated = 0;
    const suppressedEntities: string[] = [];

    for (const signal of entitySignals) {
      // Extract entity name from title
      const entityName = signal.title
        .replace(/^Repeat (Company|Agency|Entity):\s*/, "")
        .replace(/^Repeat Entity:\s*/, "")
        .trim();

      if (!entityName) continue;

      // T3. Check for non-entity placeholder names
      if (NON_ENTITY_NAMES.has(entityName.toLowerCase().trim()) || entityName.length <= 2 || /^\d+$/.test(entityName)) {
        await db.update(liveSignals)
          .set({ active: false })
          .where(eq(liveSignals.id, signal.id));
        suppressed++;
        suppressedEntities.push(`${entityName} (non-entity placeholder)`);
        continue;
      }

      // T2. Classify with dataset context
      const classification = classifyEntity(entityName, signal.datasetId ?? undefined);
      // Use actual pattern count from supportingStatistics if available
      const frequency = (signal.supportingStatistics as any)?.patternCount ?? 100;
      const decision = shouldGenerateSignal(classification, frequency, false);

      reclassified++;

      if (!decision.generate) {
        // Suppress this signal — mark as inactive
        await db.update(liveSignals)
          .set({ active: false })
          .where(eq(liveSignals.id, signal.id));
        suppressed++;
        suppressedEntities.push(`${entityName} (${classification.entityRole})`);
      } else {
        // T5. Update with role information and improved title/description
        const roleLabel = classification.entityRole === "business" || classification.entityRole === "respondent"
          ? "Company" : classification.entityRole === "agency" ? "Agency" : "Entity";
        const entityTypeLabel = classification.entityType.replace(/_/g, " ");

        await db.update(liveSignals)
          .set({
            entityType: classification.entityType,
            entityRole: classification.entityRole,
            roleConfidence: classification.roleConfidence.toFixed(4),
            entityConfidenceScore: classification.confidence.toFixed(4),
            canonicalEntityName: classification.canonicalName || entityName,
            entityAliasesJson: classification.aliases.length > 0 ? classification.aliases : null,
            title: `Repeat ${roleLabel}: ${classification.canonicalName || entityName}`,
            patternSummary: `${roleLabel} "${classification.canonicalName || entityName}" (${entityTypeLabel}) appears in complaints, significantly above the entity average.`,
          })
          .where(eq(liveSignals.id, signal.id));
        updated++;
      }
    }

    // T4. Update frequency_spike signal titles from old format to new
    const spikeSignals = await db
      .select()
      .from(liveSignals)
      .where(and(
        eq(liveSignals.active, true),
        sql`${liveSignals.signalType} = 'frequency_spike'`
      ));

    let spikeUpdated = 0;
    for (const signal of spikeSignals) {
      if (signal.title.startsWith("Elevated Volume:")) {
        const newTitle = signal.title.replace("Elevated Volume:", "Sector Spike:");
        await db.update(liveSignals)
          .set({ title: newTitle })
          .where(eq(liveSignals.id, signal.id));
        spikeUpdated++;
      }
    }

    return {
      total: entitySignals.length,
      reclassified,
      suppressed,
      updated,
      suppressedEntities,
      spikeUpdated,
    };
  }),

  /** Find merge candidates from existing entity aliases */
  findMergeCandidates: adminProcedure
    .input(z.object({ similarityThreshold: z.number().default(0.80) }))
    .mutation(async ({ input }) => {
      // Get all unique entity names from live_signals
      const entities = await db
        .select({ title: liveSignals.title })
        .from(liveSignals)
        .where(sql`${liveSignals.signalType} = 'repeat_entity' AND ${liveSignals.active} = true`);

      const entityNames = entities
        .map(e => e.title.replace(/^Repeat (Company|Agency|Entity):\s*/, "").replace(/^Repeat Entity:\s*/, "").trim())
        .filter(Boolean);

      return findMergeCandidates(entityNames, input.similarityThreshold);
    }),

  /** Apply a confirmed entity merge */
  applyEntityMerge: adminProcedure
    .input(z.object({
      canonicalName: z.string(),
      entityType: z.string(),
      variants: z.array(z.string()),
      confidence: z.number(),
    }))
    .mutation(async ({ input }) => {
      await applyMerge({
        canonicalName: input.canonicalName,
        entityType: input.entityType as any,
        variants: input.variants,
        similarity: 1.0,
        confidence: input.confidence,
      });
      return { success: true };
    }),

  /** Get entity alias registry */
  listEntityAliases: protectedProcedure
    .input(z.object({ limit: z.number().default(100) }))
    .query(async ({ input }) => {
      return db.select().from(entityAliases).orderBy(desc(entityAliases.createdAt)).limit(input.limit);
    }),

  /** Get entity type distribution for active signals (reads from detected_signals canonical source) */
  getEntityTypeDistribution: protectedProcedure.query(async () => {
    const distribution = await db
      .select({
        entityRole: detectedSignals.entityRole,
        count: count(),
      })
      .from(detectedSignals)
      .where(sql`${detectedSignals.signalType} = 'repeat_entity'`)
      .groupBy(detectedSignals.entityRole);

    return distribution.map(d => ({
      entityType: d.entityRole ?? "unclassified",
      count: d.count,
    }));
  }),
});
