/**
 * Sunam Autonomous Backfill
 * 
 * Direct executor pathway for Sunam to process signals autonomously.
 * No NL replanning, no stream registration, no SQL fallback.
 * 
 * Flow:
 * 1. Read unprocessed signals from live_signals
 * 2. Run signal processing through gate (approve/reject)
 * 3. Log each processed signal to sunam_gate_log
 * 4. Return summary (processed, inserted, skipped, failed)
 */

import { db } from "./db.ts";
import { liveSignals, sunamGateLog, detectedSignals } from "../drizzle/schema.ts";
import { notInArray, sql } from "drizzle-orm";
import { processSignalThroughGate } from "./sunam-gate.ts";

export interface ProcessSignalsBatchResult {
  processed: number;
  inserted: number;
  skipped: number;
  failed: number;
  finalDetectedSignalsCount: number;
  errors: Array<{ signalId: number; error: string }>;
}

/**
 * Process a batch of unprocessed signals through the Sunam gate
 * 
 * This is the core Sunam backfill action.
 * It reads signals that haven't been processed yet, runs them through
 * the gate (approve/reject), and logs the results.
 */
export async function processSignalsBatch(
  batchSize: number = 100
): Promise<ProcessSignalsBatchResult> {
  const result: ProcessSignalsBatchResult = {
    processed: 0,
    inserted: 0,
    skipped: 0,
    failed: 0,
    finalDetectedSignalsCount: 0,
    errors: [],
  };

  try {
    // Step 1: Get all signal IDs that have been processed (logged in sunam_gate_log)
    let processedSignalIds: number[] = [];
    try {
      const rows = await db
        .select({ signalId: sunamGateLog.liveSignalId })
        .from(sunamGateLog);
      processedSignalIds = rows?.map((r: any) => r.signalId).filter((id: any): id is number => id !== null) || [];
    } catch (err) {
      // If query fails, start with empty list
      processedSignalIds = [];
    }

    // Step 2: Get unprocessed signals (up to batchSize)
    const unprocessedSignals = await db
      .select()
      .from(liveSignals)
      .where(
        processedSignalIds.length > 0
          ? notInArray(liveSignals.id, processedSignalIds)
          : undefined // If no processed signals yet, get all
      )
      .limit(batchSize);

    result.processed = unprocessedSignals.length;

    // Step 3: Process each signal through the gate
    for (const signal of unprocessedSignals) {
      try {
        // Run the gate-controlled signal processing pipeline
        // Returns: { decision, destination, destinationId, gateLogId }
        const gateResult = await processSignalThroughGate(signal);

        // The gate already logs the decision and promotes/stages the signal
        // We just need to count the results
        if (gateResult.destination === "detected_signals") {
          result.inserted++;
        } else {
          result.skipped++;
        }
      } catch (error) {
        result.failed++;
        result.errors.push({
          signalId: signal.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    // Step 4: Get final detected signals count
    try {
      const countResults = await db
        .select({ count: sql<number>`COUNT(*)` })
        .from(detectedSignals);
      result.finalDetectedSignalsCount = countResults?.[0]?.count || 0;
    } catch (countError) {
      // If count query fails, just use 0
      result.finalDetectedSignalsCount = 0;
    }
  } catch (error) {
    throw new Error(
      `Sunam backfill failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  return result;
}

/**
 * Get backfill status and history
 */
export async function getBackfillStatus() {
  const totalProcessed = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(sunamGateLog);

  const totalDetected = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(detectedSignals);

  return {
    totalProcessed: totalProcessed[0]?.count || 0,
    totalDetected: totalDetected[0]?.count || 0,
  };
}
