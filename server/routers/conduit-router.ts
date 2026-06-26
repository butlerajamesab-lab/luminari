import { db } from '../db';
/**
 * Conduit Router — tRPC procedures for Mission Control panels:
 *   - Metadata Health
 *   - Pipeline Integrity
 *   - Export Readiness
 */

import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { sql } from "drizzle-orm";
import { scanSchema, detectDrift, validateMetadataCompleteness, generateOutput, logConduitEvent } from "../metadata-conduit";
import { enforceAllRules } from "../enforcement-rules";
import { getBackboneTableCounts } from "../engine-output-persist";

export const conduitRouter = router({

  // ─── Metadata Health Panel ───

  metadataHealth: protectedProcedure.query(async ({ ctx }) => {
    // Table registry stats
    const [tableRows] = await db.execute(sql`
      SELECT category, status, COUNT(*) as cnt, SUM(rowCount) as total_rows
      FROM table_registry
      GROUP BY category, status
      ORDER BY category
    `);

    // Field dictionary stats
    const [fieldStats] = await db.execute(sql`
      SELECT COUNT(*) as total_fields,
             SUM(CASE WHEN isPrimaryKey = 1 THEN 1 ELSE 0 END) as pk_fields,
             SUM(CASE WHEN isIndexed = 1 THEN 1 ELSE 0 END) as indexed_fields
      FROM field_dictionary
    `);

    // Drift check
    const drift = await detectDrift();

    // Conduit event counts (last 24h)
    const cutoff = Date.now() - 86400000;
    const [eventCounts] = await db.execute(sql`
      SELECT event_type, COUNT(*) as cnt
      FROM conduit_events
      WHERE createdAt > ${cutoff}
      GROUP BY event_type
      ORDER BY cnt DESC
    `);

    // Total tables in registry
    const [totalTables] = await db.execute(sql`SELECT COUNT(*) as cnt FROM table_registry`);
    const [totalFields] = await db.execute(sql`SELECT COUNT(*) as cnt FROM field_dictionary`);

    return {
      tables: {
        total: (totalTables as unknown as Record<string, any>)[0]?.cnt || 0,
        // @ts-ignore - cast is valid at runtime
        by_category: tableRows as any[],
      },
      fields: {
        total: (totalFields as unknown as Record<string, any>)[0]?.cnt || 0,
        stats: (fieldStats as unknown as Record<string, any>)[0] || { total_fields: 0, pk_fields: 0, indexed_fields: 0 },
      },
      drift: {
        orphan_fields: drift.orphanFields,
        unknown_tables: drift.unknownTables,
        unknown_table_names: drift.unknownTableNames.slice(0, 20),
        coverage: drift.totalDbTables > 0
          ? Math.round((drift.registeredTables / drift.totalDbTables) * 100)
          : 0,
      },
      // @ts-ignore - cast is valid at runtime
      events24h: eventCounts as any[],
    };
  }),

  scanSchema: protectedProcedure.mutation(async () => {
    return await scanSchema();
  }),

  detectDrift: protectedProcedure.mutation(async () => {
    return await detectDrift();
  }),

  // ─── Pipeline Integrity Panel ───

  pipelineIntegrity: protectedProcedure.query(async ({ ctx }) => {
    // Recent engine runs with output_refs status
    const [recentRuns] = await db.execute(sql`
      SELECT run_id, engine_id, status, 
             CASE 
               WHEN output_refs IS NULL THEN 'missing'
               WHEN JSON_TYPE(output_refs) = 'OBJECT' AND JSON_EXTRACT(output_refs, '$.primary') IS NOT NULL THEN 'deterministic'
               WHEN JSON_TYPE(output_refs) = 'ARRAY' THEN 'legacy'
               ELSE 'unknown'
             END as ref_format,
             CASE WHEN snapshot_id IS NOT NULL THEN 1 ELSE 0 END as has_snapshot,
             startedAt, completedAt
      FROM engine_runs
      ORDER BY startedAt DESC
      LIMIT 50
    `);

    // Enforcement rule summary across recent successful runs
    const [successRuns] = await db.execute(sql`
      SELECT run_id FROM engine_runs WHERE status = 'success' ORDER BY completedAt DESC LIMIT 10
    `);

    const ruleResults: any[] = [];
    for (const r of (successRuns as unknown as Record<string, any>).slice(0, 5)) {
      const enforcement = await enforceAllRules(r.run_id);
      ruleResults.push({
        run_id: r.run_id,
        allPassed: enforcement.allPassed,
        failedRules: enforcement.results.filter(x => !x.passed).map(x => x.rule),
      });
    }

    // Backbone counts
    const backboneCounts = await getBackboneTableCounts();

    // Output format distribution
    const [formatDist] = await db.execute(sql`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN output_refs IS NULL THEN 1 ELSE 0 END) as no_refs,
        SUM(CASE WHEN JSON_TYPE(output_refs) = 'OBJECT' AND JSON_EXTRACT(output_refs, '$.primary') IS NOT NULL THEN 1 ELSE 0 END) as deterministic,
        SUM(CASE WHEN JSON_TYPE(output_refs) = 'ARRAY' THEN 1 ELSE 0 END) as legacy
      FROM engine_runs
    `);

    return {
      // @ts-ignore - cast is valid at runtime
      recent_runs: recentRuns as any[],
      enforcement: ruleResults,
      backboneCounts,
      format_distribution: (formatDist as unknown as Record<string, any>)[0] || { total: 0, no_refs: 0, deterministic: 0, legacy: 0 },
    };
  }),

  enforceRules: protectedProcedure
    .input(z.object({ runId: z.string() }))
    .mutation(async ({ input }) => {
      return await enforceAllRules(input.runId);
    }),

  // ─── Export Readiness Panel ───

  exportReadiness: protectedProcedure.query(async ({ ctx }) => {
    // Snapshots with bound runs
    const [snapshots] = await db.execute(sql`
      SELECT s.id, s.caseId, s.status, s.createdAt,
             COUNT(er.run_id) as bound_runs,
             SUM(CASE WHEN er.status = 'success' THEN 1 ELSE 0 END) as success_runs
      FROM case_snapshots s
      LEFT JOIN engine_runs er ON er.snapshot_id = s.id
      GROUP BY s.id
      ORDER BY s.createdAt DESC
      LIMIT 20
    `);

    // Alpha Lake exports
    const [exports] = await db.execute(sql`
      SELECT id, snapshot_id, export_type, status, createdAt
      FROM alpha_lake_exports
      ORDER BY createdAt DESC
      LIMIT 20
    `);

    // Readiness check: how many snapshots have all runs passing enforcement
    const readySnapshots: any[] = [];
    for (const snap of (snapshots as unknown as Record<string, any>).slice(0, 5)) {
      if (snap.boundRuns > 0 && snap.successRuns === snap.boundRuns) {
        readySnapshots.push({
          snapshotId: snap.id,
          caseId: snap.caseId,
          boundRuns: snap.boundRuns,
          ready: true,
        });
      }
    }

    // Conduit events for ALPHA_EXPORT
    const [exportEvents] = await db.execute(sql`
      SELECT COUNT(*) as cnt FROM conduit_events WHERE event_type = 'ALPHA_EXPORT'
    `);

    return {
      // @ts-ignore - cast is valid at runtime
      snapshots: snapshots as any[],
      // @ts-ignore - cast is valid at runtime
      exports: exports as any[],
      readySnapshots,
      total_alpha_exports: (exportEvents as unknown as Record<string, any>)[0]?.cnt || 0,
    };
  }),

  generateAlphaExport: protectedProcedure
    .input(z.object({ snapshotId: z.number() }))
    .mutation(async ({ input }) => {
      return await generateOutput(input.snapshotId);
    }),

  // ─── Validate metadata completeness for a run ───

  validateCompleteness: protectedProcedure
    .input(z.object({ runId: z.string() }))
    .mutation(async ({ input }) => {
      return await validateMetadataCompleteness(input.runId);
    }),
});
