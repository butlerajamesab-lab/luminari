// LINT-GUARD: RETIRED legacy signal promotion boundary
/**
 * process_signals_batch — retired compatibility entry point
 *
 * The canonical signal architecture does not permit one transport or source
 * record to become one governed signal. Atlas raw observations are aggregated
 * by declared deterministic detection rules before eligible Domain 3 findings
 * are registered in public.live_data_signals. Legacy public.live_signals and
 * public.detected_signals remain preserved as noncanonical historical evidence.
 *
 * This exported function remains temporarily present so stale callers fail
 * explicitly instead of importing a missing module or silently reviving the
 * retired promotion path.
 */

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

export async function processSignalsBatch(
  _input: ProcessSignalsBatchInput,
): Promise<ProcessSignalsBatchResult> {
  throw new Error(
    "process_signals_batch_retired: per-record live_signals promotion is prohibited; use the canonical Atlas detection candidate to live_data_signals receipt path",
  );
}
