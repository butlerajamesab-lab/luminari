// LINT-GUARD: AUTHORIZED live_signals accessor — backfill pipeline infrastructure
/**
 * process_signals_batch — Dedicated Sunam Backfill Action
 *
 * Direct executor pathway. No NL replanning. No stream registration.
 * No stream-registry writes. No SQL fallback.
 *
 * Reads unprocessed rows from live_signals (not yet in sunam_gate_log),
 * runs each through the existing Sunam gate scoring/promotion path,
 * inserts into detected_signals if not already present,
 * logs every decision in sunam_gate_log.
 *
 * Returns: { processed, inserted, skipped, failed, final_detected_signals_count }
 */

import { db } from "./db";
import { sql } from "drizzle-orm";
import { processSignalThroughGate, LiveSignalRow } from "./sunam-gate";

// ─── Types ──────────────────────────────────────────────────────

export interface ProcessSignalsBatchInput {
  batch_size?: number;
}

export interface ProcessSignalsBatchResult {
  processed: number;
  inserted: number;
  skipped: number;
  failed: number;
  final_detected_signals_count: number;
  details?: Array<{
    live_signal_id: number;
    outcome: "inserted" | "skipped" | "rejected" | "failed";
    score?: number;
    reason?: string;
  }>;
}

// LiveSignalRow imported from sunam-gate.ts

// ─── Main Entry Point ──────────────────────────────────────────

export async function processSignalsBatch(
  input: ProcessSignalsBatchInput
): Promise<ProcessSignalsBatchResult> {
  const batchSize = input.batch_size ?? 500;

  // Step 1: Find live_signals NOT yet in sunam_gate_log
  const unprocessedRows = await db.execute(sql`
    SELECT ls.id,
           ls.signalType_ls   AS signalType,
           ls.datasetId_ls    AS datasetId,
           ls.jurisdiction_ls AS jurisdiction,
           ls.domain_ls       AS domain,
           ls.severity_ls     AS severity,
           ls.title_ls        AS title,
           ls.explanation_ls  AS explanation,
           ls.patternSummary,
           ls.supportingStatistics,
           ls.confidenceScore,
           ls.detectedAt_ls   AS detectedAt,
           ls.ingestRunId,
           ls.signalFingerprint,
           ls.entity_type_ls  AS entityType,
           ls.canonical_entity_name AS canonicalEntityName,
           ls.entity_role     AS entityRole
    FROM live_signals ls
    LEFT JOIN sunam_gate_log gl ON gl.live_signal_id = ls.id
    WHERE gl.id IS NULL
      AND ls.active_ls = 1
    ORDER BY ls.id ASC
    LIMIT ${batchSize}
  `);

  const rows = (unprocessedRows as any)[0] as any[];
  const total = rows.length;

  if (total === 0) {
    // Nothing to process — return current count
    const countRows = await db.execute(
      sql`SELECT COUNT(*) AS cnt FROM detected_signals`
    );
    const finalCount = Number((countRows as any)[0][0].cnt);
    return {
      processed: 0,
      inserted: 0,
      skipped: 0,
      failed: 0,
      final_detected_signals_count: finalCount,
    };
  }

  let inserted = 0;
  let skipped = 0;
  let failed = 0;
  const details: ProcessSignalsBatchResult["details"] = [];

  for (const row of rows) {
    const signal: LiveSignalRow = {
      id: row.id,
      signalType: row.signalType,
      datasetId: row.datasetId,
      jurisdiction: row.jurisdiction,
      domain: row.domain,
      severity: row.severity,
      title: row.title,
      explanation: row.explanation,
      patternSummary: row.patternSummary,
      supportingStatistics:
        typeof row.supportingStatistics === "string"
          ? JSON.parse(row.supportingStatistics)
          : row.supportingStatistics,
      confidenceScore: row.confidenceScore,
      detectedAt: Number(row.detectedAt),
      ingestRunId: row.ingestRunId,
      signalFingerprint: row.signalFingerprint,
      entityType: row.entityType,
      canonicalEntityName: row.canonicalEntityName,
      entityRole: row.entityRole,
    };

    try {
      // Check if this signal's fingerprint already exists in detected_signals
      // to prevent duplicates without relying on unique constraints
      if (signal.signalFingerprint) {
        const existing = await db.execute(sql`
          SELECT signal_id FROM detected_signals
          WHERE signal_type = ${signal.signalType}
            AND dataset_id = ${signal.datasetId}
          LIMIT 1
        `);
        // Use fingerprint-based dedup: check if this exact fingerprint was already promoted
        const existingByFp = await db.execute(sql`
          SELECT id FROM sunam_gate_log
          WHERE signal_fingerprint = ${signal.signalFingerprint}
            AND decision IN ('approve', 'manual_promote')
          LIMIT 1
        `);
        if ((existingByFp as any)[0].length > 0) {
          // Already processed via a different path — log as skip and continue
          const now = Date.now();
          await db.execute(sql`
            INSERT INTO sunam_gate_log
              (live_signal_id, signal_fingerprint, signal_type, dataset_id,
               sunam_score, threshold_used, score_breakdown,
               decision, decision_reason,
               promoted_signal_id, staging_id, actor,
               decided_at, created_at)
            VALUES
              (${signal.id}, ${signal.signalFingerprint}, ${signal.signalType}, ${signal.datasetId},
               ${0}, ${0}, ${'{}'},
               'approve', ${'Skipped: fingerprint already promoted via prior path'},
               ${null}, ${null}, ${'process_signals_batch'},
               ${now}, ${now})
          `);
          skipped++;
          details?.push({
            live_signal_id: signal.id,
            outcome: "skipped",
            reason: "fingerprint already promoted",
          });
          continue;
        }
      }

      // Run through the full Sunam gate (score → promote/stage → log)
      const result = await processSignalThroughGate(signal);

      if (result.destination === "detected_signals") {
        inserted++;
        details?.push({
          live_signal_id: signal.id,
          outcome: "inserted",
          score: result.decision.score,
          reason: result.decision.reason,
        });
      } else {
        // Rejected by gate — still counts as processed, not inserted
        skipped++;
        details?.push({
          live_signal_id: signal.id,
          outcome: "rejected",
          score: result.decision.score,
          reason: result.decision.reason,
        });
      }
    } catch (err: any) {
      failed++;
      details?.push({
        live_signal_id: signal.id,
        outcome: "failed",
        reason: err.message?.substring(0, 200),
      });
      console.error(
        `[process_signals_batch] Failed signal ${signal.id}:`,
        err.message
      );
    }
  }

  // Get final detected_signals count
  const countRows = await db.execute(
    sql`SELECT COUNT(*) AS cnt FROM detected_signals`
  );
  const finalCount = Number((countRows as any)[0][0].cnt);

  const processed = inserted + skipped + failed;

  console.log(
    `[process_signals_batch] Complete: ${processed} processed, ` +
      `${inserted} inserted, ${skipped} skipped, ${failed} failed. ` +
      `Final detected_signals count: ${finalCount}`
  );

  return {
    processed,
    inserted,
    skipped,
    failed,
    final_detected_signals_count: finalCount,
    details: details?.length <= 50 ? details : undefined, // Omit details for large batches
  };
}
