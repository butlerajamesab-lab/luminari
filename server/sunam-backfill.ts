/**
 * Sunam Autonomous Backfill — retired compatibility module
 *
 * The former implementation treated every legacy live_signals row as a
 * gateable signal and could promote approved records into detected_signals.
 * That violates the canonical three-domain signal architecture. Raw Atlas
 * observations must first be aggregated by a declared deterministic rule and
 * registered through the governed live_data_signals receipt path.
 *
 * The module remains as an explicit fail-closed import boundary because the
 * disabled startup executor still references it. Historical database rows are
 * preserved; this module performs no reads or writes.
 */

export interface ProcessSignalsBatchResult {
  processed: number;
  inserted: number;
  skipped: number;
  failed: number;
  finalDetectedSignalsCount: number;
  errors: Array<{ signalId: number; error: string }>;
}

export async function processSignalsBatch(
  _batchSize: number = 100,
): Promise<ProcessSignalsBatchResult> {
  throw new Error(
    "sunam_backfill_retired: per-record live_signals promotion is prohibited; use the canonical Atlas detection candidate to live_data_signals receipt path",
  );
}

export async function getBackfillStatus() {
  return {
    totalProcessed: 0,
    totalDetected: 0,
    retired: true,
    canonicalPath: "atlas_detection_candidate_to_live_data_signals_receipt",
  };
}
